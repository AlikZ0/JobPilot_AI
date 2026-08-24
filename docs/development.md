# Development

## Requirements

- Node.js 20+
- Chrome 116+ (side panel API)

## Setup

```bash
npm install
npm run build
```

Load `dist/` at `chrome://extensions` → Developer mode → Load unpacked.

## Scripts

| Command              | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `npm run dev`        | Vite watch build into `dist/`                         |
| `npm run build`      | Production build (app bundle + content script bundle) |
| `npm run test`       | Vitest unit suite                                     |
| `npm run test:watch` | Vitest in watch mode                                  |
| `npm run test:e2e`   | Playwright suite against the built extension          |
| `npm run lint`       | ESLint, `--max-warnings=0`                            |
| `npm run typecheck`  | `tsc --noEmit`                                        |
| `npm run format`     | Prettier write                                        |
| `npm run zip`        | Package `dist/` as `dist.zip` for the Web Store       |

Run `lint`, `typecheck` and `test` before every commit; `build` before every E2E run.

## Two builds, one dist

`vite.config.ts` builds the side panel, popup and service worker (ES modules).
`vite.content.config.ts` builds the content script as a single IIFE, because a
script injected with `chrome.scripting.executeScript({ files })` cannot use ESM
imports. The second build runs with `emptyOutDir: false` so it lands next to the
first.

## Reloading during development

| Change             | What to do                                    |
| ------------------ | --------------------------------------------- |
| Side panel / popup | Close and reopen the panel                    |
| Service worker     | Reload the extension on `chrome://extensions` |
| Content script     | Reload the extension, then reload the page    |
| `manifest.json`    | Reload the extension                          |

## Debugging

- **Service worker**: `chrome://extensions` → JobPilot → _service worker_ link.
- **Side panel**: right-click inside it → Inspect.
- **Content script**: the page's own DevTools console; logs are prefixed
  `[jobpilot:content]`.
- **Database**: DevTools → Application → IndexedDB → `jobpilot`.

## Testing

Unit tests use happy-dom plus `fake-indexeddb`, with a small `chrome` stub in
`tests/setup.ts`. They cover extraction, adapters, scoring, deduplication, form
mapping and filling, the database and its state machines, AI schema validation and
prompt invariants, the queue, messaging, and the security greps.

E2E tests load the real built extension in Chromium. Extensions require a headed
browser:

```bash
npm run build
xvfb-run -a npm run test:e2e            # headless machine
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome xvfb-run -a npm run test:e2e
```

## Adding things

- **A job board** → `docs/job-adapters.md`
- **An AI provider** → `docs/ai.md`
- **A message type** → add a `Def<…>` entry to `MessageDefs`, then implement the
  handler; TypeScript will point at every place that needs updating.
- **A scoring component** → add the weight in `weights.ts` (the total must stay 100),
  add the scorer in `engine.ts`, extend `scoreBreakdownSchema`, and bump
  `ANALYSIS_VERSION` so cached analyses are recomputed.

## Conventions

- Strict TypeScript, no `any` in new code.
- Zod schemas are the source of truth for every persisted or received shape.
- Never introduce a string message type at a call site.
- Comments explain _why_, not _what_.
