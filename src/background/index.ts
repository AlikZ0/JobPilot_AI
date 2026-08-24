import { MESSAGE_TYPES } from '@/types/messages';
import { broadcast } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { getSettings } from '@/database/repositories/settingsRepository';
import { getProfile } from '@/database/repositories/profileRepository';
import { registerBackgroundHandlers } from './messageRouter';
import { registerCommands } from './commands';
import { jobIdFromNotification } from './notifications';
import { getJob } from '@/database/repositories/jobRepository';

const log = createLogger('background');

registerBackgroundHandlers();
registerCommands();

// Clicking the toolbar icon opens the side panel next to the current tab.
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (error) {
    log.debug('side panel behaviour not available', error);
  }
  // Materialise defaults so the UI never starts against an empty database.
  await getSettings();
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
    if (!jobId) return;
    const job = await getJob(jobId);
    if (job?.url) await chrome.tabs.create({ url: job.url, active: true });
    await chrome.notifications.clear(notificationId);
  })();
});

chrome.permissions.onAdded.addListener(() => {
  broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'settings' });
});
chrome.permissions.onRemoved.addListener(() => {
  broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'settings' });
});

log.info('service worker started');
