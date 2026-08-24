import { createLogger } from '@/utils/logger';
import { listGrantedOrigins } from '@/utils/permissions';
import { getSettings } from '@/database/repositories/settingsRepository';

const log = createLogger('scripts');

const SCRIPT_ID = 'jobpilot-passive';

/**
 * Content-скрипт не прописан в манифесте: он регистрируется динамически и
 * только для тех сайтов, которым пользователь сам выдал доступ. Нужен он
 * пассивным функциям — журналу откликов и меткам на странице. Если обе
 * выключены, регистрация снимается, и скрипт запускается только по требованию.
 */
export async function syncPassiveContentScripts(): Promise<boolean> {
  if (!chrome.scripting?.registerContentScripts) return false;

  const [settings, origins] = await Promise.all([getSettings(), listGrantedOrigins()]);
  const wanted = settings.automation.trackSubmissions || settings.automation.showPageBadges;
  const matches = origins.filter((origin) => /^https?:\/\//.test(origin));

  let existing: chrome.scripting.RegisteredContentScript[] = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  } catch (error) {
    log.debug('список зарегистрированных скриптов недоступен', error);
  }

  if (!wanted || matches.length === 0) {
    if (existing.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
      log.info('пассивный content-скрипт снят с регистрации');
    }
    return false;
  }

  const definition: chrome.scripting.RegisteredContentScript = {
    id: SCRIPT_ID,
    js: ['content/index.js'],
    matches,
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true,
    world: 'ISOLATED',
  };

  try {
    if (existing.length > 0) await chrome.scripting.updateContentScripts([definition]);
    else await chrome.scripting.registerContentScripts([definition]);
    log.info('пассивный content-скрипт зарегистрирован', { sites: matches.length });
    return true;
  } catch (error) {
    log.warn('не удалось зарегистрировать content-скрипт', error);
    return false;
  }
}
