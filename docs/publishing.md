# Publishing to the Chrome Web Store

## Before you upload

```bash
npm run lint && npm run typecheck && npm run test && npm run build
xvfb-run -a npm run test:e2e
npm run zip          # produces dist.zip
```

Checklist:

- [ ] `version` in `public/manifest.json` bumped (and `package.json` to match)
- [ ] Manifest V3 (V2 is no longer accepted)
- [ ] No `<all_urls>` in `permissions`; host access stays optional
- [ ] Icons at 16/32/48/128 present in `dist/icons`
- [ ] No source maps needed in the upload (they are harmless but inflate the zip)
- [ ] Fresh profile smoke test: install → onboarding → analyze a job → prepare an
      application → export data

## Permission justifications

Copy these into the developer dashboard.

| Permission                                                | Justification                                                                                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`, `unlimitedStorage`                             | Stores the user's profile, saved jobs, analyses and settings locally. Job descriptions and analyses can exceed the default quota.                   |
| `sidePanel`                                               | The extension's main interface is a side panel shown next to the job posting.                                                                       |
| `activeTab`                                               | Reads the posting in the tab the user is on, only after they press a JobPilot button.                                                               |
| `scripting`                                               | Injects the extraction/form script on demand instead of running a content script on every page.                                                     |
| `tabs`                                                    | Opens each posting from a search results page in a background tab during a scan and closes it afterwards.                                           |
| `notifications`                                           | Notifies the user when a scan finds a high-scoring match. Can be disabled in settings.                                                              |
| `optional_host_permissions` (`http://*/*`, `https://*/*`) | Job boards live on arbitrary domains. Access is requested per site, at the moment the user analyzes or scans there, and can be revoked in settings. |

## Data-usage disclosures

- **Personally identifiable information** — collected, stored on the user's device,
  not transmitted to the developer.
- **Not sold to third parties.**
- **Not used or transferred for purposes unrelated to the item's core functionality.**
- **Not used to determine creditworthiness or for lending.**
- **Transmission to third parties**: only when the user configures an AI provider
  and enables AI requests; the provider is chosen by the user and receives a
  contact-free profile projection plus the job text.

Link `docs/privacy.md` (or a hosted copy) as the privacy policy.

## Store listing

**Short description (132 chars max)**

> Score job postings against your developer profile, see exactly why, and prepare
> applications. You always confirm before submitting.

**Detailed description** — cover: what it does, the deterministic scoring model,
that AI is optional and off by default, that data stays local, that it never
submits an application, and how site access works.

**Screenshots (1280×800)** — dashboard with stats, a job card with its score
breakdown, the bulk scan in progress, the application review screen showing the
submit gate, and the settings privacy section.

## Review notes for the reviewer

> JobPilot AI is a local-first job-matching assistant. All user data is stored in
> IndexedDB on the user's machine; the extension has no backend. AI features are
> optional, disabled by default, and use an API key that the user supplies for a
> provider they choose. Host permissions are optional and requested per site at the
> moment of use. The extension never submits a job application: it can fill fields
> and draft text, but submission requires the user to act on the site itself.

## After publishing

- Watch for adapter breakage (job boards change their DOM); `extractionQuality`
  dropping is the early signal.
- Bump `ANALYSIS_VERSION` whenever the scoring engine changes so users get
  recomputed scores.
- Keep the provider model lists in `src/providers/*/index.ts` current — they are
  only suggestions, but stale defaults confuse new users.
