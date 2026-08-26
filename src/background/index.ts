import { MESSAGE_TYPES } from '@/types/messages';
import { broadcast } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { getSettings } from '@/database/repositories/settingsRepository';
import { getProfile } from '@/database/repositories/profileRepository';
import { registerBackgroundHandlers } from './messageRouter';
import { registerCommands } from './commands';
import { applicationIdFromNotification, jobIdFromNotification } from './notifications';
import { registerFollowUpAlarm, scheduleFollowUpChecks } from './followUps';
import { syncPassiveContentScripts } from './contentScripts';
import { getJob } from '@/database/repositories/jobRepository';
import { getApplication } from '@/database/repositories/applicationRepository';

const log = createLogger('background');

registerBackgroundHandlers();
registerCommands();
registerFollowUpAlarm();

// Клик по иконке на панели инструментов открывает боковую панель рядом со вкладкой.
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (error) {
    log.debug('поведение боковой панели недоступно', error);
  }
  // Создаём значения по умолчанию, чтобы интерфейс не стартовал на пустой базе.
  await getSettings();
  await syncPassiveContentScripts();
  await scheduleFollowUpChecks();
  const profile = await getProfile();
  if (details.reason === 'install' && !profile.onboardingCompleted) {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('src/sidepanel/index.html#/onboarding'),
    });
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void (async () => {
    const jobId = jobIdFromNotification(notificationId);
    if (jobId) {
      const job = await getJob(jobId);
      if (job?.url) await chrome.tabs.create({ url: job.url, active: true });
      await chrome.notifications.clear(notificationId);
      return;
    }
    // Напоминание о повторном письме ведёт на страницу самой вакансии: писать
    // человек будет туда, а не в расширение.
    const applicationId = applicationIdFromNotification(notificationId);
    if (!applicationId) return;
    const application = await getApplication(applicationId);
    const job = application ? await getJob(application.jobId) : null;
    if (job?.url) await chrome.tabs.create({ url: job.url, active: true });
    await chrome.notifications.clear(notificationId);
  })();
});

chrome.permissions.onAdded.addListener(() => {
  broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'settings' });
  void syncPassiveContentScripts();
});
chrome.permissions.onRemoved.addListener(() => {
  broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'settings' });
  void syncPassiveContentScripts();
});

// Воркер засыпает: при каждом пробуждении проверяем, что набор сайтов актуален,
// и заново заводим будильник — при обновлении расширения он теряется.
chrome.runtime.onStartup.addListener(() => {
  void syncPassiveContentScripts();
  void scheduleFollowUpChecks();
});
void syncPassiveContentScripts();
void scheduleFollowUpChecks();

log.info('service worker запущен');
