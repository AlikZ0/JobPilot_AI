import 'fake-indexeddb/auto';
import { vi } from 'vitest';

/** Minimal in-memory chrome API used by unit tests. */
const storageAreas = new Map<string, Map<string, unknown>>();

function makeArea(name: string) {
  if (!storageAreas.has(name)) storageAreas.set(name, new Map());
  const area = storageAreas.get(name)!;
  return {
    async get(keys?: string | string[] | null) {
      if (keys === null || keys === undefined) return Object.fromEntries(area);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        list.filter((key) => area.has(key)).map((key) => [key, area.get(key)]),
      );
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) area.set(key, value);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) area.delete(key);
    },
    async clear() {
      area.clear();
    },
  };
}

const listeners = new Set<(...args: unknown[]) => void>();

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    getManifest: () => ({ version: '0.1.0' }),
    getURL: (path: string) => `chrome-extension://test/${path}`,
    sendMessage: vi.fn(async () => undefined),
    onMessage: {
      addListener: (listener: (...args: unknown[]) => void) => listeners.add(listener),
      removeListener: (listener: (...args: unknown[]) => void) => listeners.delete(listener),
      hasListener: (listener: (...args: unknown[]) => void) => listeners.has(listener),
    },
  },
  storage: {
    local: makeArea('local'),
    session: makeArea('session'),
    sync: makeArea('sync'),
  },
  permissions: {
    contains: vi.fn(async () => true),
    request: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    getAll: vi.fn(async () => ({ origins: [], permissions: [] })),
    onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(async () => []),
    sendMessage: vi.fn(async () => undefined),
    create: vi.fn(async () => ({ id: 1 })),
    remove: vi.fn(async () => undefined),
    get: vi.fn(async () => ({ id: 1, status: 'complete' })),
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(async () => 'id'),
    clear: vi.fn(async () => true),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  scripting: { executeScript: vi.fn(async () => []) },
  sidePanel: { open: vi.fn(async () => undefined), setPanelBehavior: vi.fn(async () => undefined) },
  commands: { onCommand: { addListener: vi.fn(), removeListener: vi.fn() } },
} as unknown as typeof chrome;
