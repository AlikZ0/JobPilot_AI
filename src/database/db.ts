import Dexie, { type Table } from 'dexie';
import type { Application, ApplicationEvent } from '@/types/application';
import type { AIUsageRecord, JobAnalysis } from '@/types/ai';
import type { Job } from '@/types/job';
import type { UserProfile } from '@/types/profile';
import type { Settings } from '@/types/settings';

export interface AssistantMessageRecord {
  id: string;
  at: number;
  role: 'user' | 'assistant';
  content: string;
  jobId: string | null;
}

export interface ScanSessionRecord {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  listingUrl: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  state: string;
}

/**
 * Хранилище, работающее без сети. Здесь лежит всё, что знает JobPilot; сервер не
 * нужен ни для одной функции, кроме обращения к AI-провайдеру.
 */
export class JobPilotDatabase extends Dexie {
  profiles!: Table<UserProfile, string>;
  settings!: Table<Settings, string>;
  jobs!: Table<Job, string>;
  analyses!: Table<JobAnalysis, string>;
  applications!: Table<Application, string>;
  applicationEvents!: Table<ApplicationEvent, string>;
  aiUsage!: Table<AIUsageRecord, string>;
  assistantMessages!: Table<AssistantMessageRecord, string>;
  scanSessions!: Table<ScanSessionRecord, string>;

  constructor(name = 'jobpilot') {
    super(name);
    this.version(1).stores({
      profiles: 'id, version, updatedAt',
      settings: 'id, updatedAt',
      jobs: 'id, fingerprint, state, score, discoveredAt, updatedAt, company, priority, scanSessionId, duplicateOf',
      analyses: 'id, jobId, jobFingerprint, profileVersion, createdAt, score',
      applications: 'id, jobId, state, updatedAt, createdAt',
      applicationEvents: 'id, applicationId, jobId, at, type',
      aiUsage: 'id, at, task, providerId, ok',
      assistantMessages: 'id, at, jobId',
      scanSessions: 'id, startedAt, state',
    });
  }
}

let instance: JobPilotDatabase | null = null;

export function getDb(): JobPilotDatabase {
  if (!instance) instance = new JobPilotDatabase();
  return instance;
}

/** Хук для тестов — позволяет подменить базу на изолированную. */
export function setDb(db: JobPilotDatabase | null): void {
  instance = db;
}

export async function clearAllData(): Promise<void> {
  const db = getDb();
  await db.transaction(
    'rw',
    [
      db.profiles,
      db.settings,
      db.jobs,
      db.analyses,
      db.applications,
      db.applicationEvents,
      db.aiUsage,
      db.assistantMessages,
      db.scanSessions,
    ],
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.settings.clear(),
        db.jobs.clear(),
        db.analyses.clear(),
        db.applications.clear(),
        db.applicationEvents.clear(),
        db.aiUsage.clear(),
        db.assistantMessages.clear(),
        db.scanSessions.clear(),
      ]);
    },
  );
}
