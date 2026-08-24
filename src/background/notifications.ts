import type { Job } from '@/types/job';
import type { ScanProgress } from '@/types/scan';
import { createLogger } from '@/utils/logger';
import { pluralize } from '@/utils/text';

const log = createLogger('notify');

const ICON = 'icons/icon128.png';
const MATCH_PREFIX = 'jobpilot:match:';

/** Maps a notification id back to the job it was created for. */
export function jobIdFromNotification(notificationId: string): string | null {
  return notificationId.startsWith(MATCH_PREFIX) ? notificationId.slice(MATCH_PREFIX.length) : null;
}

async function create(
  id: string,
  options: chrome.notifications.NotificationOptions<true>,
): Promise<void> {
  try {
    await chrome.notifications.create(id, options);
  } catch (error) {
    // Notifications can be disabled at the OS level — never break a scan.
    log.debug('notification failed', error);
  }
}

export async function notifyMatch(job: Job, score: number): Promise<void> {
  const salary =
    job.salary.min !== null
      ? `${job.salary.currency} ${job.salary.min}${job.salary.max ? `–${job.salary.max}` : ''}`
      : '';
  const lines = [job.company, job.workMode !== 'unknown' ? job.workMode : job.location, salary]
    .filter(Boolean)
    .join(' · ');
  await create(`${MATCH_PREFIX}${job.id}`, {
    type: 'basic',
    iconUrl: ICON,
    title: `🔥 ${score}% match`,
    message: `${job.title}\n${lines}`,
    priority: 1,
  });
}

export async function notifyScanComplete(progress: ScanProgress): Promise<void> {
  await create(`jobpilot:scan:${progress.sessionId}`, {
    type: 'basic',
    iconUrl: ICON,
    title: 'Scan finished',
    message: `${pluralize(progress.succeeded, 'job')} analyzed, ${progress.skipped} skipped, ${progress.failed} failed.${
      progress.bestScore !== null ? ` Best match: ${progress.bestScore}%.` : ''
    }`,
    priority: 0,
  });
}
