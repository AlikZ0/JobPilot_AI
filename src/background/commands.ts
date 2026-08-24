import { MESSAGE_TYPES } from '@/types/messages';
import { broadcast, sendToTab } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { describeError, toSerializedError } from '@/utils/errors';
import { getProfile } from '@/database/repositories/profileRepository';
import { getSettings } from '@/database/repositories/settingsRepository';
import {
  getJobByUrl,
  markJobSaved,
  upsertExtractedJob,
} from '@/database/repositories/jobRepository';
import { analyzeJob } from '@/core/analysis/analyzeJob';
import { prepareApplication } from '@/core/application/applicationService';
import { ensureContentScript, getActiveTab } from './tabManager';

const log = createLogger('commands');

async function extractActive() {
  const tab = await getActiveTab();
  const tabId = tab.id as number;
  const url = tab.url as string;
  const settings = await getSettings();
  await ensureContentScript(tabId, url);
  const extracted = await sendToTab(tabId, MESSAGE_TYPES.CONTENT_EXTRACT_JOB, {
    maxDescriptionChars: settings.costControl.maxDescriptionChars,
  });
  return { tabId, url, extracted, settings };
}

/** Сочетания клавиш, объявленные в манифесте. */
export function registerCommands(): void {
  chrome.commands.onCommand.addListener((command) => {
    void handleCommand(command).catch((error) => {
      const serialized = toSerializedError(error);
      log.warn(`команда ${command} завершилась ошибкой`, serialized);
      broadcast(MESSAGE_TYPES.EVENT_TOAST, {
        level: 'error',
        message: describeError(serialized),
      });
    });
  });
}

async function handleCommand(command: string): Promise<void> {
  switch (command) {
    case 'open-side-panel': {
      const tab = await getActiveTab();
      await chrome.sidePanel.open({ tabId: tab.id as number });
      return;
    }
    case 'analyze-current-job': {
      const tab = await getActiveTab();
      await chrome.sidePanel.open({ tabId: tab.id as number });
      const { extracted } = await extractActive();
      const { job } = await upsertExtractedJob(extracted);
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      const outcome = await analyzeJob(job, profile, settings, {});
      broadcast(MESSAGE_TYPES.EVENT_ANALYSIS_READY, outcome);
      broadcast(MESSAGE_TYPES.EVENT_TOAST, {
        level: 'success',
        message: `«${outcome.job.title || 'Вакансия'}» — совпадение ${outcome.analysis.score}%.`,
      });
      return;
    }
    case 'save-current-job': {
      const { extracted } = await extractActive();
      const { job } = await upsertExtractedJob(extracted);
      const saved = await markJobSaved(job.id);
      broadcast(MESSAGE_TYPES.EVENT_JOB_UPDATED, { job: saved });
      broadcast(MESSAGE_TYPES.EVENT_TOAST, {
        level: 'success',
        message: `Сохранено: «${saved.title}».`,
      });
      return;
    }
    case 'prepare-application': {
      const tab = await getActiveTab();
      const existing = await getJobByUrl(tab.url as string);
      const job = existing ?? (await upsertExtractedJob((await extractActive()).extracted)).job;
      const application = await prepareApplication(job);
      await chrome.sidePanel.open({ tabId: tab.id as number });
      broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'applications' });
      broadcast(MESSAGE_TYPES.EVENT_TOAST, {
        level: 'info',
        message: `Черновик заявки готов: «${job.title}» (${application.state}).`,
      });
      return;
    }
    default:
      log.debug('необработанная команда', { command });
  }
}
