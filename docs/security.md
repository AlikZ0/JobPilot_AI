# Security

## Threat model

JobPilot runs inside pages it does not control, holds an API key, and stores
personal data. The three things that must never happen:

1. A job site reads the API key or the profile.
2. Text from a page or a model is executed as code.
3. An application is submitted without an explicit human action.

## No remote code

- Manifest V3 with `script-src 'self'; object-src 'self'`.
- No `eval`, no `new Function`, no remote script tags, no `innerHTML`.
- ESLint enforces `no-eval`, `no-implied-eval`, `no-new-func`; a unit test
  (`tests/unit/security.test.ts`) greps the whole of `src/` for `eval(`,
  `new Function(`, `.innerHTML =` and `dangerouslySetInnerHTML` and fails the build
  if any appears.
- HTML from JSON-LD is converted to text with a regex/entity decoder
  (`core/extraction/html.ts`) rather than by assigning it to a DOM node.

## AI output is data

Every response goes through `parseAIJson()` → Zod. Unvalidated model text never
reaches the DOM, a selector, a URL, or storage. Enum fields (red-flag codes, field
types, seniority) reject unknown values instead of coercing them.

## API keys

| Rule                                                   | Where it is enforced                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Keys live in `chrome.storage`, optionally session-only | `core/ai/keyStore.ts`                                                                |
| Keys are never written to IndexedDB                    | nothing else writes them                                                             |
| Keys are never exported                                | `database/transfer.ts` reads only DB stores                                          |
| Keys are never logged                                  | `utils/logger.ts` redacts `key`/`token`/`secret`/`authorization` and `sk-…` patterns |
| Keys are never read outside the service worker         | unit test greps `src/content`, `src/sidepanel`, `src/popup` for `getApiKey(`         |
| Keys never reach a job site                            | providers are only called from the background context                                |

The Settings page can _write_ a key; it can never read one back. It shows a masked
placeholder instead.

## Permissions

Install-time permissions are the minimum needed to function: `storage`,
`unlimitedStorage`, `sidePanel`, `activeTab`, `scripting`, `tabs`, `notifications`.

There are **no install-time host permissions**. Site access is requested per origin
via `chrome.permissions.request()` from a user gesture in the side panel or popup,
and can be revoked from Settings. The content script is injected with
`chrome.scripting.executeScript` only after that grant.

## The submit rule

Three independent mechanisms:

1. `settingsSchema.automation.requireConfirmationBeforeSubmit` is `z.literal(true)`,
   and `coerceInvariants()` re-forces it on every read and write.
2. The application state machine only allows `ready → submitted`.
3. `markSubmitted(id, confirmedByUser)` throws unless `confirmedByUser` is true, and
   the only caller is the review screen's button, which is disabled until the user
   ticks the confirmation checkbox.

The filler never clicks a submit control and never calls `form.submit()` or
`form.requestSubmit()` — also grepped for in the security test.

## Content script boundaries

The content script can: read the DOM, report detected fields, and write values into
fields the user approved. It cannot: make network requests, read storage, see a
key, or submit a form. It is injected on demand and guards against double
registration.

## Dependencies

Runtime dependencies are limited to React, Zustand, Dexie and Zod. There is no
analytics SDK, no error-reporting SDK and no CDN asset — everything is bundled.
