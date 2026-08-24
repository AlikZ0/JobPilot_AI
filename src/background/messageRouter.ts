import { MESSAGE_TYPES, type PageInfo } from '@/types/messages';
import { registerMessageHandlers, sendToTab, broadcast } from '@/utils/messaging';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { createLogger } from '@/utils/logger';
import { hasHostPermission } from '@/utils/permissions';
import { isRestrictedUrl } from '@/utils/url';
import { getProfile } from '@/database/repositories/profileRepository';
import { getSettings } from '@/database/repositories/settingsRepository';
import {
  getJob,
  setJobState,
  updateJob,
  upsertExtractedJob,
} from '@/database/repositories/jobRepository';
import { getApplication, updateApplication } from '@/database/repositories/applicationRepository';
import { analyzeJob } from '@/core/analysis/analyzeJob';
import {
  generateApplicationAnswer,
  generateCoverLetter,
  prepareApplication,
} from '@/core/application/applicationService';
import { buildDeterministicPlan, mergeAIMappings } from '@/core/application/fieldMapper';
import { runAITask, testProviderConnection } from '@/core/ai/aiService';
import { answerAssistantQuestion } from '@/core/assistant/assistantService';
import { ensureContentScript, getActiveTab } from './tabManager';
import {
  discoverJobs,
  getScanProgress,
  pauseScan,
  resumeScan,
  startScan,
  stopScan,
} from './scanController';

const log = createLogger('router');

async function resolveTabId(explicit?: number): Promise<{ tabId: number; url: string }> {
  if (typeof explicit === 'number') {
    const tab = await chrome.tabs.get(explicit);
    if (!tab.url) throw new JobPilotError(ERROR_CODES.NO_ACTIVE_TAB, 'That tab has no URL.');
    return { tabId: explicit, url: tab.url };
  }
  const tab = await getActiveTab();
  return { tabId: tab.id as number, url: tab.url as string };
}

/** Extracts the posting from a tab, injecting the content script if needed. */
async function extractFromTab(tabId: number, url: string) {
  const settings = await getSettings();
  await ensureContentScript(tabId, url);
  return sendToTab(tabId, MESSAGE_TYPES.CONTENT_EXTRACT_JOB, {
    maxDescriptionChars: settings.costControl.maxDescriptionChars,
  });
}

export function registerBackgroundHandlers(): void {
  registerMessageHandlers({
    [MESSAGE_TYPES.PING]: () => ({
      ok: true as const,
      version: chrome.runtime.getManifest().version,
    }),

    [MESSAGE_TYPES.GET_ACTIVE_TAB_CONTEXT]: async () => {
      let tab: chrome.tabs.Tab;
      try {
        tab = await getActiveTab();
      } catch {
        return { tabId: null, pageInfo: null, hasPermission: false };
      }
      const url = tab.url ?? '';
      const tabId = tab.id as number;
      if (isRestrictedUrl(url)) return { tabId, pageInfo: null, hasPermission: false };
      const permitted = await hasHostPermission(url);
      let pageInfo: PageInfo | null = null;
      if (permitted) {
        try {
          await ensureContentScript(tabId, url);
          pageInfo = await sendToTab(tabId, MESSAGE_TYPES.CONTENT_PAGE_INFO, undefined);
        } catch (error) {
          log.debug('page info unavailable', error);
        }
      }
      return { tabId, pageInfo, hasPermission: permitted };
    },

    [MESSAGE_TYPES.REQUEST_HOST_PERMISSION]: async ({ url }) => ({
      // The actual prompt must come from a user gesture in the side panel; the
      // worker can only report the current state.
      granted: await hasHostPermission(url),
    }),

    [MESSAGE_TYPES.EXTRACT_CURRENT_JOB]: async ({ tabId }) => {
      const target = await resolveTabId(tabId);
      return extractFromTab(target.tabId, target.url);
    },

    [MESSAGE_TYPES.ANALYZE_CURRENT_JOB]: async ({ tabId, force }) => {
      const target = await resolveTabId(tabId);
      const extracted = await extractFromTab(target.tabId, target.url);
      const { job } = await upsertExtractedJob(extracted);
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      const outcome = await analyzeJob(job, profile, settings, { force: force ?? false });
      broadcast(MESSAGE_TYPES.EVENT_ANALYSIS_READY, outcome);
      return outcome;
    },

    [MESSAGE_TYPES.ANALYZE_JOB_BY_ID]: async ({ jobId, force }) => {
      const job = await getJob(jobId);
      if (!job) throw new JobPilotError(ERROR_CODES.NOT_FOUND, 'Job not found.');
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      const outcome = await analyzeJob(job, profile, settings, { force: force ?? false });
      broadcast(MESSAGE_TYPES.EVENT_ANALYSIS_READY, outcome);
      return outcome;
    },

    [MESSAGE_TYPES.SAVE_CURRENT_JOB]: async ({ tabId }) => {
      const target = await resolveTabId(tabId);
      const extracted = await extractFromTab(target.tabId, target.url);
      const { job } = await upsertExtractedJob(extracted);
      const saved = await updateJob(job.id, { state: 'saved', savedAt: Date.now() });
      broadcast(MESSAGE_TYPES.EVENT_JOB_UPDATED, { job: saved });
      return { job: saved };
    },

    [MESSAGE_TYPES.DISCOVER_JOBS]: async ({ tabId }) => {
      const target = await resolveTabId(tabId);
      await ensureContentScript(target.tabId, target.url);
      const jobs = await discoverJobs(target.tabId);
      return { jobs, listingUrl: target.url };
    },

    [MESSAGE_TYPES.START_JOB_SCAN]: async ({ tabId, maxJobs, jobs }) => {
      const target = await resolveTabId(tabId);
      let summaries = jobs ?? [];
      if (summaries.length === 0) {
        await ensureContentScript(target.tabId, target.url);
        summaries = await discoverJobs(target.tabId);
      }
      return startScan({
        listingUrl: target.url,
        jobs: summaries,
        ...(maxJobs ? { maxJobs } : {}),
      });
    },

    [MESSAGE_TYPES.STOP_JOB_SCAN]: () => stopScan(),
    [MESSAGE_TYPES.PAUSE_JOB_SCAN]: () => pauseScan(),
    [MESSAGE_TYPES.RESUME_JOB_SCAN]: () => resumeScan(),
    [MESSAGE_TYPES.GET_SCAN_PROGRESS]: () => getScanProgress(),

    [MESSAGE_TYPES.PREPARE_APPLICATION]: async ({ jobId }) => {
      const job = await getJob(jobId);
      if (!job) throw new JobPilotError(ERROR_CODES.NOT_FOUND, 'Job not found.');
      const application = await prepareApplication(job);
      broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'applications' });
      return { applicationId: application.id, jobId };
    },

    [MESSAGE_TYPES.ANALYZE_APPLICATION_FORM]: async ({ tabId, applicationId }) => {
      const target = await resolveTabId(tabId);
      await ensureContentScript(target.tabId, target.url);
      const { fields } = await sendToTab(
        target.tabId,
        MESSAGE_TYPES.CONTENT_ANALYZE_FORM,
        undefined,
      );
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      const application = await getApplication(applicationId);
      const job = application ? await getJob(application.jobId) : null;

      const requireConfirmation =
        settings.automation.requireConfirmationBeforeFill || !settings.automation.autoFillForms;
      const plan = buildDeterministicPlan(fields, profile, { requireConfirmation });
      let mappings = plan.mappings;

      if (plan.unknownFields.length > 0 && settings.privacy.allowAIRequests) {
        try {
          const result = await runAITask(
            'form_analysis',
            (resolved) =>
              resolved.provider.analyzeForm(
                {
                  fields: plan.unknownFields,
                  jobTitle: job?.title ?? '',
                  company: job?.company ?? '',
                },
                resolved.ctx,
              ),
            { settings },
          );
          mappings = mergeAIMappings(mappings, result.data.fields, fields, profile, {
            requireConfirmation,
          });
        } catch (error) {
          log.warn('AI form analysis failed; using deterministic mappings only', error);
        }
      }

      if (application) {
        await updateApplication(application.id, {
          state: application.state === 'draft' ? 'analyzing' : application.state,
          fieldMappings: mappings,
        });
      }
      return {
        url: target.url,
        createdAt: Date.now(),
        mappings,
        unknownFields: plan.unknownFields,
      };
    },

    [MESSAGE_TYPES.FILL_APPLICATION_FORM]: async ({ tabId, applicationId, mappings }) => {
      const target = await resolveTabId(tabId);
      await ensureContentScript(target.tabId, target.url);
      const result = await sendToTab(target.tabId, MESSAGE_TYPES.CONTENT_FILL_FORM, { mappings });
      const application = await getApplication(applicationId);
      if (application) {
        await updateApplication(application.id, {
          state:
            application.state === 'analyzing' || application.state === 'draft'
              ? 'filling'
              : application.state,
          fieldMappings: mappings,
        });
      }
      return result;
    },

    [MESSAGE_TYPES.GENERATE_COVER_LETTER]: async ({ jobId, applicationId, tone, instructions }) => {
      const job = await getJob(jobId);
      if (!job) throw new JobPilotError(ERROR_CODES.NOT_FOUND, 'Job not found.');
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      return generateCoverLetter(job, profile, settings, {
        ...(applicationId ? { applicationId } : {}),
        ...(tone ? { tone } : {}),
        ...(instructions ? { instructions } : {}),
      });
    },

    [MESSAGE_TYPES.GENERATE_ANSWER]: async ({
      jobId,
      applicationId,
      questionId,
      question,
      maxLength,
    }) => {
      const job = await getJob(jobId);
      if (!job) throw new JobPilotError(ERROR_CODES.NOT_FOUND, 'Job not found.');
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      return generateApplicationAnswer(job, profile, settings, {
        applicationId,
        questionId,
        question,
        ...(maxLength ? { maxLength } : {}),
      });
    },

    [MESSAGE_TYPES.ASK_ASSISTANT]: async ({ prompt, jobId, history }) =>
      answerAssistantQuestion({ prompt, ...(jobId ? { jobId } : {}), history }),

    [MESSAGE_TYPES.ANALYZE_RESUME]: async ({ text }) => {
      const settings = await getSettings();
      const result = await runAITask(
        'resume_analysis',
        (resolved) =>
          resolved.provider.analyzeResume(
            { resumeText: text, language: settings.generationLanguage },
            resolved.ctx,
          ),
        { settings },
      );
      return result.data;
    },

    [MESSAGE_TYPES.TEST_AI_PROVIDER]: () => testProviderConnection(),

    [MESSAGE_TYPES.OPEN_SIDE_PANEL]: async ({ tabId }) => {
      const target = await resolveTabId(tabId);
      await chrome.sidePanel.open({ tabId: target.tabId });
      return { ok: true };
    },
  });
}

export { setJobState };
