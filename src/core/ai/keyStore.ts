import type { AIProviderId } from '@/types/ai';

/**
 * API keys never touch IndexedDB, the export bundle, logs, or any content
 * script. They live in chrome.storage — which is extension-private — and can
 * optionally be kept in `session` storage so they are dropped when the browser
 * closes. See docs/security.md.
 */
const KEY_PREFIX = 'jobpilot.apikey.';
const MODE_KEY = 'jobpilot.apikey.storageMode';

export type KeyStorageMode = 'local' | 'session';

function areaFor(mode: KeyStorageMode): chrome.storage.StorageArea {
  return mode === 'session' && chrome.storage.session
    ? chrome.storage.session
    : chrome.storage.local;
}

export async function getKeyStorageMode(): Promise<KeyStorageMode> {
  const result = await chrome.storage.local.get(MODE_KEY);
  return result[MODE_KEY] === 'session' ? 'session' : 'local';
}

export async function setKeyStorageMode(mode: KeyStorageMode): Promise<void> {
  const previous = await getKeyStorageMode();
  if (previous === mode) return;
  // Move existing keys into the new area so the user is not logged out.
  const existing = await areaFor(previous).get(null);
  const entries = Object.entries(existing).filter(([k]) => k.startsWith(KEY_PREFIX));
  await chrome.storage.local.set({ [MODE_KEY]: mode });
  if (entries.length > 0) {
    await areaFor(mode).set(Object.fromEntries(entries));
    await areaFor(previous).remove(entries.map(([k]) => k));
  }
}

export async function getApiKey(provider: AIProviderId): Promise<string> {
  const mode = await getKeyStorageMode();
  const storageKey = `${KEY_PREFIX}${provider}`;
  const result = await areaFor(mode).get(storageKey);
  const value = result[storageKey];
  return typeof value === 'string' ? value : '';
}

export async function setApiKey(provider: AIProviderId, key: string): Promise<void> {
  const mode = await getKeyStorageMode();
  const storageKey = `${KEY_PREFIX}${provider}`;
  if (!key) {
    await areaFor(mode).remove(storageKey);
    return;
  }
  await areaFor(mode).set({ [storageKey]: key });
}

export async function hasApiKey(provider: AIProviderId): Promise<boolean> {
  return (await getApiKey(provider)).length > 0;
}

/** Which providers currently have a key — never returns the keys themselves. */
export async function listConfiguredProviders(): Promise<AIProviderId[]> {
  const mode = await getKeyStorageMode();
  const all = await areaFor(mode).get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith(KEY_PREFIX) && k !== MODE_KEY && all[k])
    .map((k) => k.slice(KEY_PREFIX.length) as AIProviderId);
}

export async function clearApiKeys(): Promise<void> {
  for (const mode of ['local', 'session'] as const) {
    const area = areaFor(mode);
    const all = await area.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX));
    if (keys.length) await area.remove(keys);
  }
}

/** Masks a key for display, e.g. "sk-…f8Ab". */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
