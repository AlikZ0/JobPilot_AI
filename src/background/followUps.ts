import { MESSAGE_TYPES } from '@/types/messages';
import { broadcast } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { DAY_MS } from '@/utils/time';
import { dueFollowUps } from '@/core/pipeline/funnel';
import { listApplications, setFollowUp } from '@/database/repositories/applicationRepository';
import { getJob } from '@/database/repositories/jobRepository';
import { getSettings } from '@/database/repositories/settingsRepository';
import { notifyFollowUp } from './notifications';

/**
 * Напоминания «пора написать повторно».
 *
 * Один периодический будильник на всё расширение, а не по одному на заявку:
 * воркер засыпает и просыпается когда угодно, а Chrome хранит будильники сам —
 * значит проще при каждом срабатывании перечитать заявки, чем следить за
 * жизнью десятков таймеров и восстанавливать их после перезапуска.
 */

const ALARM = 'jobpilot:follow-ups';
/** Час — достаточно точно для напоминания, которое человек ставил на дни вперёд. */
const PERIOD_MINUTES = 60;

const log = createLogger('follow-ups');

export async function scheduleFollowUpChecks(): Promise<void> {
  try {
    // Пересоздание сбрасывает отсчёт. Воркер просыпается от каждого чиха, и
    // будильник, заводимый заново при каждом пробуждении, до своего периода бы
    // не дожил — заводим только если его ещё нет.
    if (await chrome.alarms.get(ALARM)) return;
    await chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES, delayInMinutes: 1 });
  } catch (error) {
    log.debug('будильник недоступен', error);
  }
}

/** Показывает уведомления по заявкам, у которых подошёл срок. */
export async function runDueFollowUps(now = Date.now()): Promise<number> {
  const settings = await getSettings();
  if (!settings.notifications.enabled) return 0;

  const due = dueFollowUps(await listApplications(), now);
  for (const application of due) {
    const job = await getJob(application.jobId);
    const days = application.submittedAt
      ? Math.max(0, Math.round((now - application.submittedAt) / DAY_MS))
      : 0;
    await notifyFollowUp(application.id, job?.title || 'Вакансия', job?.company ?? '', days);
    // Снимаем срок сразу: иначе следующий час покажет то же уведомление снова.
    await setFollowUp(application.id, null);
  }
  if (due.length > 0) broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'applications' });
  return due.length;
}

export function registerFollowUpAlarm(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM) return;
    void runDueFollowUps().catch((error) => log.warn('не удалось проверить напоминания', error));
  });
}
