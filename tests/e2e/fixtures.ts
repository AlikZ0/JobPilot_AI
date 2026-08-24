import { test as base, chromium, type Browser, type Page } from '@playwright/test';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DIST = resolve(HERE, '../../dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.map': 'application/json',
};

/**
 * Отдаёт dist/ по http, чтобы гонять настоящий собранный интерфейс в обычном
 * браузере. Загрузить упакованное расширение получается не везде: Chrome
 * отключает порт удалённой отладки при --load-extension. Поэтому интерфейс
 * проверяется на собранном бандле с заглушкой chrome API, а сам пакет —
 * в packaging.spec.ts по артефактам сборки.
 */
function startServer(root: string): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const path = normalize(join(root, requested === '/' ? '/index.html' : requested));
    if (!path.startsWith(root) || !existsSync(path)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'string' || address === null) throw new Error('сервер не выдал адрес');
      done({ url: `http://127.0.0.1:${address.port}`, server });
    });
  });
}

export interface Fixtures {
  appUrl: string;
  /** Страница боковой панели с подменёнными API расширения. */
  panel: Page;
}

export const test = base.extend<Fixtures, { sharedBrowser: Browser }>({
  sharedBrowser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
      const browser = await chromium.launch({
        ...(executablePath ? { executablePath } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      await use(browser);
      await browser.close();
    },
    { scope: 'worker' },
  ],
  // eslint-disable-next-line no-empty-pattern
  appUrl: async ({}, use) => {
    if (!existsSync(resolve(DIST, 'manifest.json'))) {
      throw new Error('Нет папки dist/ — выполните `npm run build` перед E2E.');
    }
    const { url, server } = await startServer(DIST);
    await use(url);
    server.close();
  },
  panel: async ({ sharedBrowser, appUrl }, use) => {
    const context = await sharedBrowser.newContext();
    await context.addInitScript(CHROME_STUB);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${appUrl}/src/sidepanel/index.html`);
    await use(page);
    await context.close();
    if (errors.length > 0)
      throw new Error(`Необработанные ошибки в боковой панели: ${errors.join('; ')}`);
  },
});

export const expect = test.expect;

export interface ChromeManifest {
  manifest_version: number;
  permissions: string[];
  optional_host_permissions?: string[];
  host_permissions?: string[];
  content_scripts?: unknown;
  icons: Record<string, string>;
  background: { service_worker: string; type: string };
  side_panel: { default_path: string };
  action: { default_popup: string };
  content_security_policy: { extension_pages: string };
}

export function readManifest(): ChromeManifest {
  return JSON.parse(readFileSync(resolve(DIST, 'manifest.json'), 'utf8')) as ChromeManifest;
}

/**
 * Минимальная реализация тех chrome API, которых касается боковая панель.
 * Ответы повторяют контракт сообщений из src/types/messages.ts.
 */
const CHROME_STUB = () => {
  const listeners = new Set<(...args: unknown[]) => void>();
  const area = () => {
    const map = new Map<string, unknown>();
    return {
      get: async (keys?: string | string[] | null) => {
        if (keys === null || keys === undefined) return Object.fromEntries(map);
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((k) => map.has(k)).map((k) => [k, map.get(k)]));
      },
      set: async (values: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(values)) map.set(k, v);
      },
      remove: async (keys: string | string[]) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) map.delete(k);
      },
      clear: async () => map.clear(),
    };
  };

  const calls: { type: string; payload: unknown }[] = [];
  (window as unknown as { __jpCalls: typeof calls }).__jpCalls = calls;

  const respond = (type: string): unknown => {
    switch (type) {
      case 'ping':
        return { ok: true, version: '0.1.0' };
      case 'get_active_tab_context':
        return {
          tabId: 1,
          pageInfo: null,
          hasPermission: false,
          restricted: false,
          hostname: 'jobs.example.com',
        };
      case 'get_scan_progress':
        return {
          sessionId: '',
          state: 'idle',
          total: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          currentTitle: '',
          currentUrl: '',
          currentScore: null,
          bestScore: null,
          startedAt: 0,
          finishedAt: null,
          error: '',
        };
      default:
        return {};
    }
  };

  (window as unknown as { chrome: unknown }).chrome = {
    runtime: {
      id: 'stub',
      getManifest: () => ({ version: '0.1.0' }),
      getURL: (path: string) => `/${path}`,
      sendMessage: async (message: { type: string; payload: unknown }) => {
        calls.push({ type: message.type, payload: message.payload });
        return { ok: true, data: respond(message.type) };
      },
      onMessage: {
        addListener: (fn: (...args: unknown[]) => void) => listeners.add(fn),
        removeListener: (fn: (...args: unknown[]) => void) => listeners.delete(fn),
      },
    },
    storage: { local: area(), session: area(), sync: area() },
    permissions: {
      contains: async () => false,
      request: async () => false,
      remove: async () => true,
      getAll: async () => ({ origins: [], permissions: [] }),
      onAdded: { addListener: () => undefined, removeListener: () => undefined },
      onRemoved: { addListener: () => undefined, removeListener: () => undefined },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://jobs.example.com/1' }],
      create: async () => ({ id: 2 }),
      onActivated: { addListener: () => undefined, removeListener: () => undefined },
      onUpdated: { addListener: () => undefined, removeListener: () => undefined },
    },
    sidePanel: { open: async () => undefined },
    notifications: { create: async () => 'x', clear: async () => true },
  };
};
