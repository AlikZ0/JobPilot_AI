# Architecture

JobPilot AI is a Manifest V3 extension with four runtime contexts. Everything they
say to each other goes through one typed message union; nothing uses string
literals at a call site.

```
┌──────────────┐   typed messages    ┌─────────────────────┐
│  Side panel  │◀───────────────────▶│  Service worker     │
│  (React)     │                     │  (background)       │
└──────┬───────┘                     └────────┬────────────┘
       │ direct Dexie reads                   │ chrome.scripting
       │ (fast, read-mostly)                  │ + typed messages
       ▼                                      ▼
┌──────────────┐                     ┌─────────────────────┐
│  IndexedDB   │                     │  Content script     │
│  (Dexie)     │                     │  (injected per tab) │
└──────────────┘                     └─────────────────────┘
```

- **Side panel** (`src/sidepanel`) is the main UI. It reads the database directly
  for rendering and sends messages for anything that touches a tab or an AI
  provider.
- **Service worker** (`src/background`) owns tab automation, the scan queue,
  keyboard commands, notifications and every AI call. It is the only context that
  can read an API key.
- **Content script** (`src/content`) is injected on demand. It extracts postings,
  reads forms and fills approved fields. It never sees a key and never makes a
  network request.
- **Popup** (`src/popup`) is a launcher for the two most common actions.

## Message bus

`src/types/messages.ts` defines one `MessageDefs` union. Each entry binds a type
constant to its payload and its result:

```ts
type Def<T, P, R> = { type: T; payload: P; result: R };
```

`sendToBackground(type, payload)` and `sendToTab(tabId, type, payload)` infer both
sides from that union, and `registerMessageHandlers({...})` type-checks each
handler against it. Errors cross the boundary as a `SerializedError` with a stable
code, so the UI can show a specific, actionable message instead of "something went
wrong".

## Extraction pipeline

`src/core/extraction/pipeline.ts` merges four layers in priority order and records
where each field came from in `fieldSources`:

1. **JSON-LD** `JobPosting` (`jsonld.ts`) — most reliable, wins every field it has.
2. **Adapter hints** — site-specific selectors supplied by the active adapter.
3. **Meta tags** (`meta.ts`) — Open Graph and friends.
4. **DOM heuristics** (`heuristics.ts`) — labelled selectors, then a text-density
   scan that penalises link-heavy containers.

An AI extraction fallback exists as a fifth layer but only runs when the merged
result is unusable, so it costs nothing on well-formed pages.

`computeQuality()` turns provenance and completeness into a 0–1 score shown in the
UI, and `splitSections()` divides the description into requirements,
responsibilities and benefits by following headings (with a bullet-based fallback).

## Scoring

`src/core/scoring/engine.ts` is the only place a percentage is produced.

1. `matchSkills()` resolves both sides through the technology dictionary
   (`techDictionary.ts`), which knows aliases (`nodejs` → `Node.js`) and implications
   (`Nuxt` → `Vue` → `JavaScript`), and splits the posting's technologies into
   mandatory and optional using the wording of each requirement line.
2. AI findings, if present, are merged — but a skill the model claims you have is
   dropped unless your profile actually contains it.
3. Eight component scorers each return `{ earned, max, detail }`.
4. The components are summed and rounded; the band comes from fixed thresholds.

Because every scorer is a pure function of `(job, profile, findings)`, the same
inputs always produce the same number, and the breakdown always adds up to the
total. Both properties are asserted in `tests/unit/scoring.test.ts`.

## Analysis pipeline

`src/core/analysis/analyzeJob.ts`:

```
cache hit? ──yes──▶ reuse (no AI call)
   │no
   ▼
job → analyzing → AI findings (optional, failure tolerated) → deterministic score
   → persist analysis → job → analyzed
```

The cache key is `(jobFingerprint, profileVersion, ANALYSIS_VERSION)`. Editing your
profile bumps `profileVersion`, which invalidates every cached analysis; changing
the scoring engine means bumping `ANALYSIS_VERSION`.

## Bulk scan

`src/background/scanController.ts` drives the Job Browser Agent:

1. Ask the content script on the listing page for job links.
2. Build a `JobQueue` with `concurrency` (1–3, hard capped) and a delay between
   task starts.
3. For each posting: open a background tab → wait for load → inject the content
   script → extract → upsert (deduplicating) → analyze → close the tab.
4. Publish `ScanProgress` after every step so the side panel can render live
   counts; notify on high scores and on completion.

Pause, resume and stop are cooperative: `stop()` aborts the shared `AbortSignal`
and clears the queue, and every in-flight tab is closed in a `finally` block.

## State machines

`src/core/state/` declares the allowed transitions for jobs and applications, and
every repository write goes through an assertion. That is what makes
"an application can only be submitted from `ready`" a structural property rather
than a convention.

## Data model

Dexie (`src/database/db.ts`) with nine stores: profiles, settings, jobs, analyses,
applications, applicationEvents, aiUsage, assistantMessages, scanSessions. Every
record is validated with Zod on the way in and on the way out, so a schema change
or a hand-edited import cannot corrupt the UI.
