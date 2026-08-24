# JobPilot AI

A Chrome extension (Manifest V3) that reads a job posting, scores it against your
structured developer profile with a deterministic engine, explains every point of
that score, and helps you prepare the application. **It never submits anything for
you.**

<!-- prettier-ignore -->
> Local-first: your profile, jobs, analyses and applications live in IndexedDB on
> your machine. An AI provider is optional — matching, extraction and scoring all
> work with AI turned off.

---

## Features

| Area                        | What it does                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Job extraction**          | JSON-LD → meta tags → semantic HTML → DOM heuristics → optional AI fallback, with per-field provenance and a quality score |
| **Site adapters**           | Dedicated adapters for LinkedIn, Indeed and Glassdoor; a generic adapter handles every other board                         |
| **Deterministic scoring**   | 8 weighted components summing to 100. The AI supplies findings; the app computes the number                                |
| **Score explanation**       | Every component shows earned/max plus a sentence explaining it                                                             |
| **Bulk scan**               | Opens each posting from a results page in a rate-limited background tab, analyzes it and closes it again                   |
| **Duplicate detection**     | Content fingerprint (company + title + location, description digest) collapses the same posting across boards              |
| **Application autofill**    | Deterministic field mapper with an AI fallback; anything under 80 % confidence waits for you                               |
| **Cover letters & answers** | Grounded strictly in your profile; unverifiable claims are surfaced, never invented                                        |
| **Assistant**               | Answers questions using only the slice of your local data the question needs                                               |
| **Dashboard**               | Daily counts, average score, most common skill gaps, roles that fit you most often                                         |
| **Privacy controls**        | AI off by default, per-site access, export/import, clear-all-data                                                          |

### The match score

| Component                                        | Weight |
| ------------------------------------------------ | ------ |
| Technical skills                                 | 40     |
| Experience                                       | 15     |
| Seniority                                        | 10     |
| Location                                         | 10     |
| Salary                                           | 10     |
| Language                                         | 5      |
| Responsibilities                                 | 5      |
| Other (employment type, red flags, dealbreakers) | 5      |

| Score  | Band            |
| ------ | --------------- |
| 90–100 | Excellent match |
| 75–89  | Good match      |
| 60–74  | Potential match |
| 40–59  | Weak match      |
| 0–39   | Not suitable    |

The model is never asked for a percentage. It returns structured findings
(matched/missing skills, detected seniority, red flags, alignment estimate) and
`src/core/scoring/engine.ts` turns those into the score. A skill the model claims
you have is discarded unless it is actually in your profile.

---

## Installation

```bash
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

Pin the extension so the toolbar icon is visible.

---

## Quick start

1. **Create your profile.** The first run opens onboarding: name and contacts, role
   and seniority, your technology stack, and what you are looking for. Nothing here
   leaves your machine.
2. **(Optional) Configure AI.** Side panel → Settings → AI provider. Pick a provider
   (OpenAI, Anthropic, Gemini, OpenRouter, any OpenAI-compatible endpoint, or your own
   cloud gateway), paste an API key, choose a model, then enable
   _Settings → Privacy → Allow AI requests_. Press **Test connection**.
3. **Analyze one job.** Open a posting, click the JobPilot icon, grant access to that
   site once, then press **Analyze this job** (or `Alt+Shift+A`).
4. **Run a bulk scan.** Open a search-results page, open the side panel
   (`Alt+Shift+P`) and press **Analyze jobs on this page**. JobPilot opens each
   posting in a background tab, one at a time by default, and shows live progress.
5. **Prepare an application.** From a job card press **Prepare application**. On the
   application page press **Read form on this page**, review the mapped fields, then
   **Fill approved fields**. Generate a cover letter and draft answers if you want.
6. **Submit it yourself.** JobPilot fills and drafts; you press Submit on the site.
   Tick _"I submitted this application myself"_ to record it in your history.

### Keyboard shortcuts

| Shortcut      | Action                                     |
| ------------- | ------------------------------------------ |
| `Alt+Shift+J` | Open the popup                             |
| `Alt+Shift+P` | Open the side panel                        |
| `Alt+Shift+A` | Analyze the job in the current tab         |
| `Alt+Shift+S` | Save the job in the current tab            |
| `Alt+Shift+F` | Prepare an application for the current job |

Change them at `chrome://extensions/shortcuts`.

---

## Architecture

```
src/
  background/     service worker: message router, job queue, tab manager, commands
  content/        injected on demand: adapters, extraction, form analyzer, filler
  sidepanel/      React UI: dashboard, jobs, applications, assistant, settings
  popup/          small launcher
  core/
    extraction/   JSON-LD, meta, heuristics, sections, fingerprint, tech dictionary
    scoring/      weights, skill matcher, deterministic engine
    ai/           provider abstraction, prompts, JSON validation, key store, usage
    application/  field mapper, profile paths, application service
    analysis/     analysis pipeline (cache → AI findings → score → persist)
    assistant/    context builder and assistant service
    state/        job and application state machines
  database/       Dexie schema, repositories, export/import
  providers/      openai, anthropic, gemini, openrouter, custom, cloud
  types/          Zod schemas and the typed message contract
  utils/          messaging, errors, logging (with redaction), url, text, time
```

Details live in [`docs/architecture.md`](docs/architecture.md).

---

## Development

```bash
npm run dev        # watch build into dist/
npm run build      # production build (dist/)
npm run test       # unit tests (vitest)
npm run test:e2e   # Playwright end-to-end tests (needs a build first)
npm run lint       # eslint, zero warnings allowed
npm run typecheck  # tsc --noEmit
npm run format     # prettier
```

`npm run dev` rebuilds on change; press the reload button on
`chrome://extensions` to pick up service-worker or content-script changes.

The E2E suite loads the real extension, so it needs a headed Chromium. On a
machine without a display:

```bash
npm run build
xvfb-run -a npm run test:e2e
```

Set `PLAYWRIGHT_CHROMIUM_PATH` if you want to use a Chromium that Playwright did
not download itself.

### Environment variables

Nothing is required. `.env.example` documents two optional build-time values for
teams running their own AI gateway (`VITE_JOBPILOT_CLOUD_ENDPOINT`,
`VITE_JOBPILOT_CLOUD_LABEL`). **Never put an API key in a `VITE_` variable** — it
would be inlined into the public bundle.

---

## AI providers

| Provider      | Notes                                                             |
| ------------- | ----------------------------------------------------------------- |
| OpenAI        | Chat Completions, `response_format: json_object`                  |
| Anthropic     | Messages API, browser access header, JSON prefill                 |
| Google Gemini | `generateContent`, `responseMimeType: application/json`           |
| OpenRouter    | OpenAI-compatible, any routed model                               |
| Custom        | Any OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, a proxy) |
| Cloud gateway | Your own backend holds the keys; the extension stores none        |

Model, base URL, temperature, max tokens and timeout are per provider and never
hardcoded. See [`docs/ai.md`](docs/ai.md).

---

## Security

- Manifest V3, `script-src 'self'` — no remote code, no `eval`, no `new Function`.
- Every AI response is parsed as JSON and validated with Zod before use. Model
  output is data, never code, and is never inserted as HTML.
- API keys live in `chrome.storage` (optionally session-only), never in IndexedDB,
  never in an export, never in a log, and never in a content script.
- Content scripts are injected on demand and only ever read the page.
- A lint rule and a unit test both fail the build if `eval`, `new Function`,
  `innerHTML =`, `form.submit()` or a key read from the UI layer appears in `src/`.

See [`docs/security.md`](docs/security.md).

## Privacy

- Everything is stored locally. There is no JobPilot server.
- AI requests are **off by default**. When enabled, the profile projection sent to
  the provider excludes name, email, phone, links and attachments.
- Host access is requested per site, at the moment you use it, and can be revoked
  from Settings.
- Export, import and delete-everything are all one click.

See [`docs/privacy.md`](docs/privacy.md).

## The one rule that never changes

JobPilot can open a posting, analyze it, fill fields, draft a letter and draft
answers. It cannot submit an application. `requireConfirmationBeforeSubmit` is a
literal `true` in the settings schema, the application state machine only reaches
`submitted` from `ready`, and `markSubmitted()` throws unless it is called with an
explicit user confirmation. All three are covered by tests.

---

## Publishing

See [`docs/publishing.md`](docs/publishing.md) for the Chrome Web Store checklist,
including the permission justifications and the data-usage disclosures.

## License

MIT
