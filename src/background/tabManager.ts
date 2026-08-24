import { MESSAGE_TYPES } from '@/types/messages';
import { sendToTab } from '@/utils/messaging';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { hasHostPermission } from '@/utils/permissions';
import { isRestrictedUrl } from '@/utils/url';
import { createLogger } from '@/utils/logger';
import { sleep } from '@/utils/time';

const log = createLogger('tabs');

const CONTENT_SCRIPT = 'content/index.js';

/** Injects the content script unless it is already answering pings. */
export async function ensureContentScript(tabId: number, url: string): Promise<void> {
  if (isRestrictedUrl(url)) {
    throw new JobPilotError(
      ERROR_CODES.RESTRICTED_PAGE,
      'Chrome does not allow extensions to run on this page.',
      { recoverable: false },
    );
  }
  try {
    await sendToTab(tabId, MESSAGE_TYPES.CONTENT_PING, undefined);
    return;
  } catch {
    // Not injected yet — fall through.
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
        'JobPilot does not have access to this site yet.',
        { hint: 'Click "Grant access to this site" in the side panel and try again.' },
      );
    }
    throw new JobPilotError(ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE, message);
  }
  // Give the script a moment to register its message listener.
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
    'The content script did not start on this page.',
  );
}

export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) {
    throw new JobPilotError(ERROR_CODES.NO_ACTIVE_TAB, 'No active tab was found.');
  }
  return tab;
}

export interface ManagedTab {
  tabId: number;
  close(): Promise<void>;
}

/**
 * Opens a URL in a background tab, waits for it to finish loading and injects
 * the content script. Used by the bulk scanner, which must never steal focus.
 */
export async function openManagedTab(url: string, timeoutMs = 30_000): Promise<ManagedTab> {
  if (!(await hasHostPermission(url))) {
    throw new JobPilotError(
      ERROR_CODES.PERMISSION_DENIED,
      `JobPilot has no access to ${new URL(url).hostname}.`,
      { hint: 'Grant site access from the side panel before scanning.' },
    );
  }
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (typeof tabId !== 'number') {
    throw new JobPilotError(ERROR_CODES.UNKNOWN, 'Chrome did not return a tab id.');
  }
  const close = async () => {
    try {
      await chrome.tabs.remove(tabId);
    } catch (error) {
      log.debug('tab already closed', error);
    }
  };

  try {
    await waitForTabLoad(tabId, timeoutMs);
    // Client-rendered boards need a beat after "complete" before the DOM settles.
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
        finish(new JobPilotError(ERROR_CODES.UNKNOWN, 'The tab was closed while loading.'));
      }
    };
    const timer = setTimeout(
      () =>
        finish(new JobPilotError(ERROR_CODES.UNKNOWN, 'Timed out waiting for the page to load.')),
      timeoutMs,
    );
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removedListener);
    // The tab may already be complete before the listener attached.
    void chrome.tabs.get(tabId).then((current) => {
      if (current.status === 'complete') finish();
    });
  });
}
