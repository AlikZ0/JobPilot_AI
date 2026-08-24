# Privacy

## What is stored, and where

| Data                                            | Location                            | Leaves the device?                                         |
| ----------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| Profile (name, contacts, links, stack, history) | IndexedDB                           | No                                                         |
| Attachments (CV, documents)                     | IndexedDB, as data URLs             | No                                                         |
| Jobs, analyses, applications, events            | IndexedDB                           | No                                                         |
| Settings                                        | IndexedDB                           | No                                                         |
| API keys                                        | `chrome.storage` (local or session) | Only in the `Authorization` header of your chosen provider |
| Assistant conversation                          | IndexedDB                           | Only the current question plus the selected context slice  |

There is no JobPilot server. Nothing is uploaded anywhere unless you enable AI
requests, and then only to the provider you configured.

## What is sent to an AI provider

`buildAIProfile()` (`core/ai/profileProjection.ts`) builds the projection. It
contains role, seniority, years, summary, skills by category, languages, country
and city, salary expectation, and preferences — plus work history **only** if
_Share work history with AI_ is on.

It never contains:

- first or last name
- email address
- phone number
- LinkedIn / GitHub / portfolio URLs
- attachments

`shareContactDetailsWithAI` is `z.literal(false)` in the settings schema — it cannot
be turned on, and a test asserts that no fixture contact detail appears in an
outgoing prompt.

Job text is truncated to `maxDescriptionChars` (default 6000) before sending.

## Defaults

- **AI requests: off.** Extraction, matching, scoring, deduplication, autofill of
  known fields, the dashboard and export/import all work with AI disabled.
- **Notifications: on**, only for scores at or above your threshold.
- **Site access: none.** Granted per origin, when you ask for it.
- **Analytics: local only.** The dashboard is computed from your own database;
  nothing is reported anywhere.

## Logging

`utils/logger.ts` redacts before anything reaches the console:

- keys named `key`, `token`, `secret`, `password`, `authorization`, `apikey` →
  `[redacted]`
- keys named `email`, `phone`, `firstName`, `lastName`, `dataUrl` → `[pii]`
- string patterns: email addresses → `[email]`, long digit runs → `[phone]`,
  `sk-…` / `AIza…` / `Bearer …` → `[secret]`

Debug logging is only enabled in development builds.

## Your controls

| Control                           | Where                                 |
| --------------------------------- | ------------------------------------- |
| Turn AI off entirely              | Settings → Privacy                    |
| Stop sharing work history         | Settings → Privacy                    |
| Stop storing AI reasoning         | Settings → Privacy                    |
| Session-only API keys             | Settings → AI provider → Key storage  |
| Revoke a site's access            | Settings → Permissions                |
| Export everything as JSON         | Settings → Your data                  |
| Import a backup                   | Settings → Your data                  |
| Delete everything, including keys | Settings → Your data → Clear all data |

## Export format

```jsonc
{
  "version": 1,
  "exportedAt": "2026-01-15T10:00:00.000Z",
  "app": "jobpilot-ai",
  "appVersion": "0.1.0",
  "profile": {/* … */},
  "settings": {/* … */},
  "jobs": [],
  "analyses": [],
  "applications": [],
}
```

API keys are deliberately absent. Imports are validated with Zod, refuse a newer
`version`, and skip applications whose job is missing (reporting how many).

## Chrome Web Store data disclosures

- Personally identifiable information: **collected** (stored locally only, not
  transmitted by the developer).
- Not sold to third parties, not used for advertising, not used for creditworthiness.
- Transmitted to a third party only when the user configures an AI provider and
  enables AI requests; the destination is chosen by the user.
