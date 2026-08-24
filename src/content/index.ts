import { MESSAGE_TYPES, type PageInfo } from '@/types/messages';
import { registerMessageHandlers, sendToBackground } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { resolveAdapter } from './adapters/registry';
import type { AdapterContext } from './adapters/types';
import { analyzeForms, hasApplicationForm } from './forms/analyzer';
import { fillFields, highlightField } from './forms/filler';
import { resetSubmissionTracking, startSubmissionTracking } from './tracking';
import { refreshPageBadges, startPageBadges } from './badges';

const log = createLogger('content');

declare global {
  interface Window {
    __jobpilotContentLoaded?: boolean;
  }
}

/** Скрипт внедряется по требованию, поэтому защищаемся от повторной регистрации. */
if (window.__jobpilotContentLoaded) {
  log.debug('content-скрипт уже активен');
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
    log.warn('не удалось классифицировать страницу', error);
  }
  if (isListing) {
    try {
      listingCount = (await adapter.extractJobsFromListing(ctx)).length;
    } catch (error) {
      log.warn('не удалось посчитать вакансии в списке', error);
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
    log.warn('не удалось определить форму', error);
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
          'На этой странице не удалось найти вакансию.',
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
          'На этой странице не найдено полей, которые можно заполнить.',
        );
      }
      return { fields };
    },

    [MESSAGE_TYPES.CONTENT_FILL_FORM]: ({ mappings }) => fillFields(document, mappings),

    [MESSAGE_TYPES.CONTENT_HIGHLIGHT_FIELD]: ({ fieldId }) => ({
      ok: highlightField(document, fieldId),
    }),
  });

  void startPassiveFeatures();

  log.debug('content-скрипт готов', { url: location.href });
}

/**
 * Журнал откликов и метки на странице. Обе функции пассивные: они ничего не
 * отправляют за пользователя, только замечают то, что он сделал сам. Каждую
 * можно выключить в настройках расширения.
 */
async function startPassiveFeatures(): Promise<void> {
  let config: { trackSubmissions: boolean; showPageBadges: boolean };
  try {
    config = await sendToBackground(MESSAGE_TYPES.TRACKER_CONFIG, undefined);
  } catch (error) {
    log.debug('настройки трекинга недоступны', error);
    return;
  }
  if (!config.trackSubmissions && !config.showPageBadges) return;

  if (config.trackSubmissions) startSubmissionTracking(safeHasForm());
  if (config.showPageBadges) startPageBadges();

  watchUrlChanges(() => {
    if (config.trackSubmissions) resetSubmissionTracking(safeHasForm());
    if (config.showPageBadges) refreshPageBadges();
  });
}

/** Сайты вакансий — одностраничные приложения: смена URL не перезагружает скрипт. */
function watchUrlChanges(onChange: () => void): void {
  let previous = location.href;
  const check = () => {
    if (location.href === previous) return;
    previous = location.href;
    onChange();
  };
  window.addEventListener('popstate', check);
  window.addEventListener('hashchange', check);
  setInterval(check, 1000);
}
