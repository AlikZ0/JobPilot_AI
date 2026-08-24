import { MESSAGE_TYPES, type PageInfo } from '@/types/messages';
import { registerMessageHandlers } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { resolveAdapter } from './adapters/registry';
import type { AdapterContext } from './adapters/types';
import { analyzeForms, hasApplicationForm } from './forms/analyzer';
import { fillFields, highlightField } from './forms/filler';

const log = createLogger('content');

declare global {
  interface Window {
    __jobpilotContentLoaded?: boolean;
  }
}

/** The script is injected on demand, so guard against double registration. */
if (window.__jobpilotContentLoaded) {
  log.debug('content script already active');
} else {
  window.__jobpilotContentLoaded = true;
  bootstrap();
}

function context(maxDescriptionChars = 6000): AdapterContext {
  return { doc: document, url: location.href, maxDescriptionChars };
}

async function buildPageInfo(): Promise<PageInfo> {
  const ctx = context();
  const adapter = resolveAdapter(ctx.url);
  let listingCount = 0;
  let isListing = false;
  let isJob = false;
  try {
    isJob = adapter.isJobPage(ctx);
    isListing = adapter.isListingPage(ctx);
  } catch (error) {
    log.warn('page classification failed', error);
  }
  if (isListing) {
    try {
      listingCount = (await adapter.extractJobsFromListing(ctx)).length;
    } catch (error) {
      log.warn('listing count failed', error);
    }
  }
  return {
    url: ctx.url,
    title: document.title,
    hostname: location.hostname,
    adapterId: adapter.id,
    looksLikeJobPage: isJob,
    looksLikeListingPage: isListing,
    hasApplicationForm: safeHasForm(),
    listingCount,
  };
}

function safeHasForm(): boolean {
  try {
    return hasApplicationForm(document);
  } catch (error) {
    log.warn('form detection failed', error);
    return false;
  }
}

function bootstrap(): void {
  registerMessageHandlers({
    [MESSAGE_TYPES.CONTENT_PING]: () => ({ ok: true as const }),

    [MESSAGE_TYPES.CONTENT_PAGE_INFO]: async () => buildPageInfo(),

    [MESSAGE_TYPES.CONTENT_EXTRACT_JOB]: async ({ maxDescriptionChars }) => {
      const ctx = context(maxDescriptionChars);
      const adapter = resolveAdapter(ctx.url);
      const job = await adapter.extractJob(ctx);
      if (!job.title && !job.description) {
        throw new JobPilotError(
          ERROR_CODES.NO_JOB_ON_PAGE,
          'Could not find a job posting on this page.',
        );
      }
      return job;
    },

    [MESSAGE_TYPES.CONTENT_EXTRACT_LISTING]: async () => {
      const ctx = context();
      const adapter = resolveAdapter(ctx.url);
      const jobs = await adapter.extractJobsFromListing(ctx);
      return { jobs };
    },

    [MESSAGE_TYPES.CONTENT_ANALYZE_FORM]: () => {
      const fields = analyzeForms(document);
      if (fields.length === 0) {
        throw new JobPilotError(
          ERROR_CODES.NO_FORM_ON_PAGE,
          'No fillable form fields were found on this page.',
        );
      }
      return { fields };
    },

    [MESSAGE_TYPES.CONTENT_FILL_FORM]: ({ mappings }) => fillFields(document, mappings),

    [MESSAGE_TYPES.CONTENT_HIGHLIGHT_FIELD]: ({ fieldId }) => ({
      ok: highlightField(document, fieldId),
    }),
  });

  log.debug('content script ready', { url: location.href });
}
