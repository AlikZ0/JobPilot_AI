import { MESSAGE_TYPES } from '@/types/messages';
import { sendToTab } from '@/utils/messaging';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { hasHostPermission } from '@/utils/permissions';
import { isRestrictedUrl } from '@/utils/url';
import { createLogger } from '@/utils/logger';
import { sleep } from '@/utils/time';

const log = createLogger('tabs');

const CONTENT_SCRIPT = 'content/index.js';

/** Внедряет content-скрипт, если он ещё не отвечает на ping. */
export async function ensureContentScript(tabId: number, url: string): Promise<void> {
  if (isRestrictedUrl(url)) {
    throw new JobPilotError(
      ERROR_CODES.RESTRICTED_PAGE,
      'Chrome не разрешает расширениям работать на этой странице.',
      { recoverable: false },
    );
  }
  try {
    await sendToTab(tabId, MESSAGE_TYPES.CONTENT_PING, undefined);
    return;
  } catch {
    // Ещё не внедрён — идём дальше.
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [CONTENT_SCRIPT],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Cannot access contents|permission|host permissions/i.test(message)) {
      throw new JobPilotError(
        ERROR_CODES.PERMISSION_DENIED,
        'У JobPilot пока нет доступа к этому сайту.',
        { hint: 'Нажмите «Выдать доступ к этому сайту» в боковой панели и повторите.' },
      );
    }
    throw new JobPilotError(ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE, message);
  }
  // Даём скрипту мгновение, чтобы зарегистрировать слушателя сообщений.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await sendToTab(tabId, MESSAGE_TYPES.CONTENT_PING, undefined);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new JobPilotError(
    ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
    'Content-скрипт не запустился на этой странице.',
  );
}

export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) {
    throw new JobPilotError(ERROR_CODES.NO_ACTIVE_TAB, 'Активная вкладка не найдена.');
  }
  return tab;
}

export interface ManagedTab {
  tabId: number;
  close(): Promise<void>;
}

/**
 * Открывает URL в фоновой вкладке, дожидается загрузки и внедряет content-скрипт.
 * Используется массовым анализом, который не должен перехватывать фокус.
 */
export async function openManagedTab(url: string, timeoutMs = 30_000): Promise<ManagedTab> {
  if (!(await hasHostPermission(url))) {
    throw new JobPilotError(
      ERROR_CODES.PERMISSION_DENIED,
      `У JobPilot нет доступа к ${new URL(url).hostname}.`,
      { hint: 'Выдайте доступ к сайту в боковой панели перед запуском анализа.' },
    );
  }
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (typeof tabId !== 'number') {
    throw new JobPilotError(ERROR_CODES.UNKNOWN, 'Chrome не вернул идентификатор вкладки.');
  }
  const close = async () => {
    try {
      await chrome.tabs.remove(tabId);
    } catch (error) {
      log.debug('вкладка уже закрыта', error);
    }
  };

  try {
    await waitForTabLoad(tabId, timeoutMs);
    // Сайтам на клиентском рендеринге нужна пауза после «complete», чтобы DOM устоялся.
    await sleep(600);
    await ensureContentScript(tabId, url);
    return { tabId, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export function waitForTabLoad(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(removedListener);
      if (error) reject(error);
      else resolve();
    };
    const listener = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedId === tabId && info.status === 'complete') finish();
    };
    const removedListener = (removedId: number) => {
      if (removedId === tabId) {
        finish(new JobPilotError(ERROR_CODES.UNKNOWN, 'Вкладку закрыли во время загрузки.'));
      }
    };
    const timer = setTimeout(
      () =>
        finish(new JobPilotError(ERROR_CODES.UNKNOWN, 'Истекло время ожидания загрузки страницы.')),
      timeoutMs,
    );
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removedListener);
    // Вкладка могла загрузиться ещё до того, как мы подписались на событие.
    void chrome.tabs.get(tabId).then((current) => {
      if (current.status === 'complete') finish();
    });
  });
}
