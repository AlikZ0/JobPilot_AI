import { EMPTY_PROGRESS, type ScanProgress } from '@/types/scan';
import type { JobSummary } from '@/types/job';
import { MESSAGE_TYPES } from '@/types/messages';
import { broadcast, sendToTab } from '@/utils/messaging';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { createId } from '@/utils/id';
import { createLogger } from '@/utils/logger';
import { hasHostPermission } from '@/utils/permissions';
import { getDb } from '@/database/db';
import { getProfile, isProfileUsable } from '@/database/repositories/profileRepository';
import { getSettings } from '@/database/repositories/settingsRepository';
import { getJobByUrl, upsertExtractedJob } from '@/database/repositories/jobRepository';
import { analyzeJob } from '@/core/analysis/analyzeJob';
import { JobQueue } from './jobQueue';
import { openManagedTab } from './tabManager';
import { notifyMatch, notifyScanComplete } from './notifications';

const log = createLogger('scan');

let progress: ScanProgress = { ...EMPTY_PROGRESS };
let queue: JobQueue<void> | null = null;

export function getScanProgress(): ScanProgress {
  return progress;
}

function publish(patch: Partial<ScanProgress>): ScanProgress {
  progress = { ...progress, ...patch };
  broadcast(MESSAGE_TYPES.EVENT_SCAN_PROGRESS, progress);
  return progress;
}

export function isScanRunning(): boolean {
  return (
    progress.state === 'running' || progress.state === 'discovering' || progress.state === 'paused'
  );
}

/** Читает список вакансий в указанной вкладке, никуда не переходя. */
export async function discoverJobs(tabId: number): Promise<JobSummary[]> {
  const { jobs } = await sendToTab(tabId, MESSAGE_TYPES.CONTENT_EXTRACT_LISTING, undefined);
  return jobs;
}

export interface StartScanParams {
  listingUrl: string;
  jobs: JobSummary[];
  maxJobs?: number;
}

/**
 * Агент обхода вакансий: открывает каждую найденную вакансию в фоновой вкладке,
 * извлекает её, анализирует и закрывает вкладку — по умолчанию по одной за раз.
 */
export async function startScan(params: StartScanParams): Promise<ScanProgress> {
  if (isScanRunning()) {
    throw new JobPilotError(ERROR_CODES.SCAN_ALREADY_RUNNING, 'Анализ уже выполняется.');
  }
  const settings = await getSettings();
  const profile = await getProfile();
  if (!isProfileUsable(profile)) {
    throw new JobPilotError(
      ERROR_CODES.PROFILE_INCOMPLETE,
      'Заполните профиль, прежде чем запускать массовый анализ.',
      { hint: 'Откройте вкладку «Профиль» и добавьте должность и навыки.' },
    );
  }

  const limit = Math.min(
    params.maxJobs ?? settings.automation.maxJobsPerSession,
    settings.automation.maxJobsPerSession,
  );
  const targets = params.jobs.slice(0, limit);
  if (targets.length === 0) {
    throw new JobPilotError(
      ERROR_CODES.NO_JOB_ON_PAGE,
      'На этой странице не найдено ссылок на вакансии.',
    );
  }
  if (!(await hasHostPermission(params.listingUrl))) {
    throw new JobPilotError(
      ERROR_CODES.PERMISSION_DENIED,
      'Чтобы открывать вакансии в фоновых вкладках, JobPilot нужен доступ к этому сайту.',
      { hint: 'Сначала нажмите «Выдать доступ к этому сайту» в боковой панели.' },
    );
  }

  const sessionId = createId('scan');
  progress = {
    ...EMPTY_PROGRESS,
    sessionId,
    state: 'running',
    total: targets.length,
    startedAt: Date.now(),
  };
  await getDb().scanSessions.put({
    id: sessionId,
    startedAt: progress.startedAt,
    finishedAt: null,
    listingUrl: params.listingUrl,
    total: targets.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    state: 'running',
  });
  publish({});

  queue = new JobQueue<void>(
    {
      concurrency: settings.automation.maxConcurrentTabs,
      delayMs: settings.automation.delayBetweenJobsMs,
    },
    {
      onTaskError: (task, error) => {
        log.warn('задача анализа упала', { id: task.id, error });
        publish({
          processed: progress.processed + 1,
          failed: progress.failed + 1,
        });
      },
    },
  );

  for (const summary of targets) {
    queue.add({
      id: summary.url,
      run: async (signal) => {
        await processOne(summary, sessionId, signal);
      },
    });
  }

  // Запускаем в фоне: вызывающий код сразу получает начальный прогресс.
  void queue
    .run()
    .catch((error) => {
      log.error('массовый анализ упал', error);
      publish({ state: 'error', error: error instanceof Error ? error.message : String(error) });
    })
    .finally(() => {
      void finishScan(sessionId);
    });

  return progress;
}

async function processOne(
  summary: JobSummary,
  sessionId: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  const settings = await getSettings();
  const profile = await getProfile();
  publish({
    currentTitle: summary.title || summary.url,
    currentUrl: summary.url,
    currentScore: null,
  });

  if (settings.automation.skipAlreadyAnalyzed) {
    const existing = await getJobByUrl(summary.url);
    if (existing?.analyzedAt && existing.score !== null) {
      publish({
        processed: progress.processed + 1,
        skipped: progress.skipped + 1,
        currentScore: existing.score,
      });
      return;
    }
  }

  const tab = await openManagedTab(summary.url);
  try {
    const extracted = await sendToTab(tab.tabId, MESSAGE_TYPES.CONTENT_EXTRACT_JOB, {
      maxDescriptionChars: settings.costControl.maxDescriptionChars,
    });
    const { job } = await upsertExtractedJob(extracted, { scanSessionId: sessionId });
    const outcome = await analyzeJob(job, profile, settings, { signal });
    broadcast(MESSAGE_TYPES.EVENT_ANALYSIS_READY, {
      job: outcome.job,
      analysis: outcome.analysis,
      fromCache: outcome.fromCache,
    });

    const best = Math.max(progress.bestScore ?? 0, outcome.analysis.score);
    publish({
      processed: progress.processed + 1,
      succeeded: progress.succeeded + 1,
      currentScore: outcome.analysis.score,
      bestScore: best,
    });

    if (
      settings.notifications.enabled &&
      outcome.analysis.score >= settings.notifications.minScore
    ) {
      await notifyMatch(outcome.job, outcome.analysis.score);
    }
  } finally {
    await tab.close();
  }
}

async function finishScan(sessionId: string): Promise<void> {
  const finishedAt = Date.now();
  const state = progress.state === 'error' ? 'error' : 'done';
  publish({ state, finishedAt, currentTitle: '', currentUrl: '' });
  queue = null;
  await getDb().scanSessions.update(sessionId, {
    finishedAt,
    processed: progress.processed,
    succeeded: progress.succeeded,
    failed: progress.failed,
    skipped: progress.skipped,
    state,
  });
  const settings = await getSettings();
  if (settings.notifications.enabled && settings.notifications.notifyOnScanComplete) {
    await notifyScanComplete(progress);
  }
}

export function stopScan(): ScanProgress {
  queue?.stop();
  queue = null;
  return publish({ state: 'stopping' });
}

export function pauseScan(): ScanProgress {
  queue?.pause();
  return publish({ state: 'paused' });
}

export function resumeScan(): ScanProgress {
  queue?.resume();
  return publish({ state: 'running' });
}
