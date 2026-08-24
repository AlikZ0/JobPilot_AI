import type { Job } from '@/types/job';
import type { ScanProgress } from '@/types/scan';
import { createLogger } from '@/utils/logger';

const log = createLogger('notify');

const ICON = 'icons/icon128.png';
const MATCH_PREFIX = 'jobpilot:match:';

/** Восстанавливает по id уведомления вакансию, для которой оно создано. */
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
    // Уведомления могут быть выключены на уровне ОС — это не должно ломать анализ.
    log.debug('не удалось показать уведомление', error);
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
    title: `🔥 совпадение ${score}%`,
    message: `${job.title}\n${lines}`,
    priority: 1,
  });
}

export async function notifyScanComplete(progress: ScanProgress): Promise<void> {
  await create(`jobpilot:scan:${progress.sessionId}`, {
    type: 'basic',
    iconUrl: ICON,
    title: 'Анализ завершён',
    message: `Проанализировано вакансий: ${progress.succeeded}, пропущено: ${progress.skipped}, с ошибкой: ${progress.failed}.${
      progress.bestScore !== null ? ` Лучшее совпадение: ${progress.bestScore}%.` : ''
    }`,
    priority: 0,
  });
}
