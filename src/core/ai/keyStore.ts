import type { AIProviderId } from '@/types/ai';
import { createId } from '@/utils/id';

/**
 * API-ключи никогда не попадают в IndexedDB, в экспорт, в логи и в content-скрипт.
 * Они живут в chrome.storage — приватном для расширения — и при желании могут
 * храниться в `session`, чтобы стираться при закрытии браузера.
 * См. docs/security.md.
 *
 * Ключей у провайдера может быть несколько (рабочий и личный, разные проекты и
 * лимиты): они хранятся списком, а переключение — это смена активной записи.
 * Наружу отдаются только метаданные с маской, сам секрет читает лишь aiService.
 */
const KEY_PREFIX = 'jobpilot.apikey.';
const MODE_KEY = 'jobpilot.apikey.storageMode';
const ENTRIES_KEY = 'jobpilot.apikey.entries';
const ACTIVE_KEY = 'jobpilot.apikey.active';
/** Служебные записи — не ключи, поэтому при переборе их пропускаем. */
const RESERVED_KEYS = new Set([MODE_KEY, ENTRIES_KEY, ACTIVE_KEY]);

export type KeyStorageMode = 'local' | 'session';

/** Ключ вместе с секретом — не покидает этот модуль. */
interface StoredKey {
  id: string;
  providerId: AIProviderId;
  label: string;
  secret: string;
  createdAt: number;
}

/** Что можно показать в интерфейсе: без секрета, только маска. */
export interface ApiKeyInfo {
  id: string;
  providerId: AIProviderId;
  label: string;
  masked: string;
  createdAt: number;
  active: boolean;
}

interface KeyState {
  entries: StoredKey[];
  /** Какой ключ используется у каждого провайдера. */
  active: Partial<Record<AIProviderId, string>>;
}

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
  // Переносим существующие ключи в новую область, чтобы пользователь их не потерял.
  const existing = await areaFor(previous).get(null);
  const entries = Object.entries(existing).filter(
    ([k]) => k.startsWith(KEY_PREFIX) && k !== MODE_KEY,
  );
  await chrome.storage.local.set({ [MODE_KEY]: mode });
  if (entries.length > 0) {
    await areaFor(mode).set(Object.fromEntries(entries));
    await areaFor(previous).remove(entries.map(([k]) => k));
  }
}

function isStoredKey(value: unknown): value is StoredKey {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<StoredKey>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.providerId === 'string' &&
    typeof entry.secret === 'string'
  );
}

/**
 * Читает список ключей, попутно поднимая записи старого формата (один ключ на
 * провайдера в отдельной записи storage) в общий список.
 */
async function readState(mode: KeyStorageMode): Promise<KeyState> {
  const area = areaFor(mode);
  const all = await area.get(null);
  const raw = all[ENTRIES_KEY];
  const entries: StoredKey[] = Array.isArray(raw) ? raw.filter(isStoredKey) : [];
  const activeRaw = all[ACTIVE_KEY];
  const active: KeyState['active'] =
    activeRaw && typeof activeRaw === 'object' ? { ...(activeRaw as KeyState['active']) } : {};

  const legacy = Object.entries(all).filter(
    ([k, v]) => k.startsWith(KEY_PREFIX) && !RESERVED_KEYS.has(k) && typeof v === 'string' && v,
  );
  if (legacy.length === 0) return { entries, active };

  for (const [storageKey, secret] of legacy) {
    const providerId = storageKey.slice(KEY_PREFIX.length) as AIProviderId;
    const entry: StoredKey = {
      id: createId(),
      providerId,
      label: 'Основной',
      secret: secret as string,
      createdAt: Date.now(),
    };
    entries.push(entry);
    active[providerId] ??= entry.id;
  }
  await area.remove(legacy.map(([k]) => k));
  await writeState(mode, { entries, active });
  return { entries, active };
}

async function writeState(mode: KeyStorageMode, state: KeyState): Promise<void> {
  await areaFor(mode).set({ [ENTRIES_KEY]: state.entries, [ACTIVE_KEY]: state.active });
}

/** Активная запись провайдера; если выбор потерялся — первая из сохранённых. */
function activeEntry(state: KeyState, provider: AIProviderId): StoredKey | undefined {
  const forProvider = state.entries.filter((entry) => entry.providerId === provider);
  const selected = forProvider.find((entry) => entry.id === state.active[provider]);
  return selected ?? forProvider[0];
}

export async function getApiKey(provider: AIProviderId): Promise<string> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  return activeEntry(state, provider)?.secret ?? '';
}

/**
 * Заменяет активный ключ провайдера. Пустое значение удаляет его — так же, как
 * раньше вело себя хранилище с одним ключом на провайдера.
 */
export async function setApiKey(provider: AIProviderId, key: string): Promise<void> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  const current = activeEntry(state, provider);
  if (!key) {
    if (current) await removeEntry(mode, state, current.id);
    return;
  }
  if (current) {
    current.secret = key;
    state.active[provider] = current.id;
    await writeState(mode, state);
    return;
  }
  await addApiKey(provider, 'Основной', key);
}

/** Добавляет ещё один ключ провайдера и сразу делает его активным. */
export async function addApiKey(
  provider: AIProviderId,
  label: string,
  key: string,
): Promise<ApiKeyInfo> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  const entry: StoredKey = {
    id: createId(),
    providerId: provider,
    label: label.trim().slice(0, 60) || `Ключ ${state.entries.length + 1}`,
    secret: key,
    createdAt: Date.now(),
  };
  state.entries.push(entry);
  state.active[provider] = entry.id;
  await writeState(mode, state);
  return toInfo(entry, state);
}

/** Переключает провайдера на другой сохранённый ключ. */
export async function selectApiKey(id: string): Promise<void> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  state.active[entry.providerId] = entry.id;
  await writeState(mode, state);
}

export async function renameApiKey(id: string, label: string): Promise<void> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  entry.label = label.trim().slice(0, 60) || entry.label;
  await writeState(mode, state);
}

export async function deleteApiKey(id: string): Promise<void> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  await removeEntry(mode, state, id);
}

async function removeEntry(mode: KeyStorageMode, state: KeyState, id: string): Promise<void> {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  state.entries = state.entries.filter((item) => item.id !== id);
  if (state.active[entry.providerId] === id) {
    // Провайдер без выбора остался бы без ключа, хотя запасной есть — выбираем его.
    const fallback = state.entries.find((item) => item.providerId === entry.providerId);
    if (fallback) state.active[entry.providerId] = fallback.id;
    else delete state.active[entry.providerId];
  }
  await writeState(mode, state);
}

function toInfo(entry: StoredKey, state: KeyState): ApiKeyInfo {
  return {
    id: entry.id,
    providerId: entry.providerId,
    label: entry.label,
    masked: maskKey(entry.secret),
    createdAt: entry.createdAt,
    active: activeEntry(state, entry.providerId)?.id === entry.id,
  };
}

/** Сохранённые ключи без секретов — для экрана настроек. */
export async function listApiKeys(provider?: AIProviderId): Promise<ApiKeyInfo[]> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  return state.entries
    .filter((entry) => !provider || entry.providerId === provider)
    .map((entry) => toInfo(entry, state));
}

export async function hasApiKey(provider: AIProviderId): Promise<boolean> {
  return (await getApiKey(provider)).length > 0;
}

/** Для каких провайдеров сохранён ключ — сами ключи наружу не отдаются. */
export async function listConfiguredProviders(): Promise<AIProviderId[]> {
  const mode = await getKeyStorageMode();
  const state = await readState(mode);
  return [...new Set(state.entries.filter((entry) => entry.secret).map((e) => e.providerId))];
}

export async function clearApiKeys(): Promise<void> {
  for (const mode of ['local', 'session'] as const) {
    const area = areaFor(mode);
    const all = await area.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX) && k !== MODE_KEY);
    if (keys.length) await area.remove(keys);
  }
}

/** Маскирует ключ для показа, например «sk-…f8Ab». */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
