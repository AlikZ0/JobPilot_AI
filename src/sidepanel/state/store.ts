import { create } from 'zustand';
import type { Job } from '@/types/job';
import type { JobAnalysis } from '@/types/ai';
import type { Application } from '@/types/application';
import type { SubmissionRecord } from '@/types/submission';
import type { UserProfile } from '@/types/profile';
import type { Settings } from '@/types/settings';
import type { PageInfo, ToastPayload } from '@/types/messages';
import { EMPTY_PROGRESS, type ScanProgress } from '@/types/scan';
import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { ERROR_CODES, describeError, toSerializedError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { getProfile, saveProfile } from '@/database/repositories/profileRepository';
import { getSettings, saveSettings } from '@/database/repositories/settingsRepository';
import { listJobs } from '@/database/repositories/jobRepository';
import { listAnalyses } from '@/database/repositories/analysisRepository';
import { listApplications } from '@/database/repositories/applicationRepository';
import { listSubmissions } from '@/database/repositories/submissionRepository';

export type Route =
  | 'dashboard'
  | 'jobs'
  | 'job'
  | 'profile'
  | 'applications'
  | 'application'
  | 'assistant'
  | 'resume'
  | 'settings'
  | 'onboarding';

export interface Toast extends ToastPayload {
  id: string;
}

interface JobPilotState {
  ready: boolean;
  route: Route;
  selectedJobId: string | null;
  selectedApplicationId: string | null;
  /** Какая вкладка открыта на экране «Заявки»: черновики или журнал откликов. */
  applicationsTab: 'drafts' | 'history';
  profile: UserProfile | null;
  settings: Settings | null;
  jobs: Job[];
  analyses: Record<string, JobAnalysis>;
  applications: Application[];
  submissions: SubmissionRecord[];
  pageInfo: PageInfo | null;
  activeTabId: number | null;
  hasHostPermission: boolean;
  /** Служебная страница Chrome: расширение туда не пускают, доступ выдать нельзя. */
  tabRestricted: boolean;
  tabHostname: string;
  scan: ScanProgress;
  busy: string | null;
  toasts: Toast[];

  init(): Promise<void>;
  navigate(route: Route, id?: string): void;
  openSubmissionHistory(): void;
  refreshData(): Promise<void>;
  refreshTabContext(): Promise<void>;
  updateProfile(patch: Partial<UserProfile>, bumpVersion?: boolean): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  setBusy(label: string | null): void;
  pushToast(toast: ToastPayload): void;
  dismissToast(id: string): void;
  reportError(error: unknown): void;
  setScan(progress: ScanProgress): void;
  applyAnalysis(job: Job, analysis: JobAnalysis): void;
}

export const useStore = create<JobPilotState>((set, get) => ({
  ready: false,
  route: 'dashboard',
  selectedJobId: null,
  selectedApplicationId: null,
  applicationsTab: 'drafts',
  profile: null,
  settings: null,
  jobs: [],
  analyses: {},
  applications: [],
  submissions: [],
  pageInfo: null,
  activeTabId: null,
  hasHostPermission: false,
  tabRestricted: false,
  tabHostname: '',
  scan: EMPTY_PROGRESS,
  busy: null,
  toasts: [],

  async init() {
    const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
    set({
      profile,
      settings,
      ready: true,
      route: profile.onboardingCompleted ? 'dashboard' : 'onboarding',
    });
    await get().refreshData();
    await get().refreshTabContext();
    try {
      set({ scan: await sendToBackground(MESSAGE_TYPES.GET_SCAN_PROGRESS, undefined) });
    } catch {
      // Воркер может ещё запускаться; прогресс всё равно придёт широковещательно.
    }
  },

  navigate(route, id) {
    if (route === 'job') set({ route, selectedJobId: id ?? get().selectedJobId });
    else if (route === 'application') set({ route, selectedApplicationId: id ?? null });
    else set({ route });
  },

  openSubmissionHistory() {
    set({ route: 'applications', applicationsTab: 'history' });
  },

  async refreshData() {
    const [jobs, analyses, applications, submissions] = await Promise.all([
      listJobs({ limit: 500, sortBy: 'discoveredAt' }),
      listAnalyses(500),
      listApplications(),
      listSubmissions(500),
    ]);
    const byJob: Record<string, JobAnalysis> = {};
    for (const analysis of analyses) {
      const current = byJob[analysis.jobId];
      if (!current || current.createdAt < analysis.createdAt) byJob[analysis.jobId] = analysis;
    }
    set({ jobs, analyses: byJob, applications, submissions });
  },

  async refreshTabContext() {
    try {
      const context = await sendToBackground(MESSAGE_TYPES.GET_ACTIVE_TAB_CONTEXT, undefined);
      set({
        pageInfo: context.pageInfo,
        activeTabId: context.tabId,
        hasHostPermission: context.hasPermission,
        tabRestricted: context.restricted,
        tabHostname: context.hostname,
      });
    } catch {
      set({ pageInfo: null, hasHostPermission: false, tabRestricted: false, tabHostname: '' });
    }
  },

  async updateProfile(patch, bumpVersion = true) {
    const profile = await saveProfile(patch, { bumpVersion });
    set({ profile });
  },

  async updateSettings(patch) {
    const settings = await saveSettings(patch);
    set({ settings });
  },

  setBusy(label) {
    set({ busy: label });
  },

  pushToast(toast) {
    // Одинаковые сообщения не дублируются: две копии одной ошибки выглядят
    // как две разные проблемы.
    if (get().toasts.some((current) => current.message === toast.message)) return;
    const entry = { ...toast, id: createId('toast') };
    set({ toasts: [...get().toasts, entry] });
    setTimeout(() => get().dismissToast(entry.id), toast.level === 'error' ? 8000 : 4000);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },

  reportError(error) {
    const serialized = toSerializedError(error);
    // Запрет Chrome и не выданный доступ — это не поломка, а ожидаемое
    // состояние: красный тост тут только пугает.
    const expected =
      serialized.code === ERROR_CODES.RESTRICTED_PAGE ||
      serialized.code === ERROR_CODES.PERMISSION_DENIED;
    get().pushToast({
      level: expected ? 'warning' : 'error',
      message: describeError(serialized),
    });
  },

  setScan(progress) {
    set({ scan: progress });
  },

  applyAnalysis(job, analysis) {
    const jobs = get().jobs.some((entry) => entry.id === job.id)
      ? get().jobs.map((entry) => (entry.id === job.id ? job : entry))
      : [job, ...get().jobs];
    set({ jobs, analyses: { ...get().analyses, [job.id]: analysis } });
  },
}));

/** Выполняет асинхронное действие с индикатором занятости и общей обработкой ошибок. */
export async function withBusy<T>(label: string, action: () => Promise<T>): Promise<T | null> {
  const { setBusy, reportError } = useStore.getState();
  setBusy(label);
  try {
    return await action();
  } catch (error) {
    reportError(error);
    return null;
  } finally {
    setBusy(null);
  }
}
