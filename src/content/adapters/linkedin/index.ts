import type { ExtractedJob, JobSummary } from '@/types/job';
import { extractJobFromDocument, type AdapterHints } from '@/core/extraction/pipeline';
import { elementText } from '@/core/extraction/html';
import { normalizeWhitespace, uniqueBy } from '@/utils/text';
import { absoluteUrl, hostnameOf, normalizeUrl } from '@/utils/url';
import type { AdapterContext, JobSiteAdapter } from '../types';

const TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  '.top-card-layout__title',
  'h1.topcard__title',
  'h1',
];

const COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name',
  '.jobs-unified-top-card__company-name',
  '.topcard__org-name-link',
  '.top-card-layout__card .topcard__flavor',
];

const LOCATION_SELECTORS = [
  '.job-details-jobs-unified-top-card__primary-description-container span.tvm__text',
  '.jobs-unified-top-card__bullet',
  '.topcard__flavor--bullet',
];

const DESCRIPTION_SELECTORS = [
  '.jobs-description__content',
  '.jobs-box__html-content',
  '.show-more-less-html__markup',
  '#job-details',
];

const INSIGHT_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-insight',
  '.jobs-unified-top-card__job-insight',
  '.description__job-criteria-item',
];

/** LinkedIn: /jobs/view/<id> — вакансия, /jobs/search и /jobs/collections — списки. */
export class LinkedInAdapter implements JobSiteAdapter {
  readonly id = 'linkedin';
  readonly label = 'LinkedIn';

  canHandle(url: string): boolean {
    return hostnameOf(url).endsWith('linkedin.com');
  }

  isJobPage(context: AdapterContext): boolean {
    if (/\/jobs\/view\//.test(context.url)) return true;
    if (/currentJobId=/.test(context.url)) return true;
    return Boolean(context.doc.querySelector(DESCRIPTION_SELECTORS.join(',')));
  }

  isListingPage(context: AdapterContext): boolean {
    return (
      /\/jobs\/(search|collections)/.test(context.url) ||
      context.doc.querySelectorAll('a.job-card-container__link, a.job-card-list__title').length > 2
    );
  }

  async extractJob(context: AdapterContext): Promise<ExtractedJob> {
    const hints: AdapterHints = {
      title: this.text(context.doc, TITLE_SELECTORS),
      company: this.text(context.doc, COMPANY_SELECTORS),
      location: this.text(context.doc, LOCATION_SELECTORS),
      description: this.description(context.doc),
      salaryText: this.insightMatching(context.doc, /[$€£]\s?\d|salary|\/yr|\/hr/i),
      workModeText: this.insightMatching(context.doc, /remote|hybrid|on-site|onsite/i),
    };
    return extractJobFromDocument(
      {
        doc: context.doc,
        url: context.url,
        maxDescriptionChars: context.maxDescriptionChars,
        source: this.id,
      },
      hints,
    );
  }

  async extractJobsFromListing(context: AdapterContext): Promise<JobSummary[]> {
    const cards = Array.from(
      context.doc.querySelectorAll(
        'li.jobs-search-results__list-item, div.job-card-container, li.scaffold-layout__list-item, div.base-card',
      ),
    );
    const summaries: JobSummary[] = [];
    for (const card of cards) {
      const anchor = card.querySelector<HTMLAnchorElement>(
        'a.job-card-container__link, a.job-card-list__title, a.base-card__full-link, a[href*="/jobs/view/"]',
      );
      const href = anchor?.getAttribute('href');
      if (!href) continue;
      summaries.push({
        title: normalizeWhitespace(
          anchor?.getAttribute('aria-label') ?? anchor?.textContent ?? '',
        ).replace(/^(.*?)\1$/, '$1'),
        company: this.text(card, [
          '.job-card-container__primary-description',
          '.artdeco-entity-lockup__subtitle',
          '.base-search-card__subtitle',
        ]),
        location: this.text(card, [
          '.job-card-container__metadata-item',
          '.job-search-card__location',
        ]),
        url: normalizeUrl(absoluteUrl(href, context.url)),
        listingId:
          card.getAttribute('data-job-id') ?? card.getAttribute('data-occludable-job-id') ?? '',
        salaryHint: this.text(card, [
          '.job-card-container__metadata-item--workplace-type',
          '[class*="salary" i]',
        ]),
      });
    }
    return uniqueBy(summaries, (summary) => summary.url).slice(0, 200);
  }

  private text(root: ParentNode, selectors: string[]): string {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const value = normalizeWhitespace(element?.textContent ?? '');
      if (value) return value;
    }
    return '';
  }

  private description(doc: Document): string {
    for (const selector of DESCRIPTION_SELECTORS) {
      const text = elementText(doc.querySelector(selector));
      if (text.length > 200) return text;
    }
    return '';
  }

  private insightMatching(doc: Document, pattern: RegExp): string {
    for (const selector of INSIGHT_SELECTORS) {
      for (const element of Array.from(doc.querySelectorAll(selector))) {
        const text = normalizeWhitespace(element.textContent ?? '');
        if (pattern.test(text)) return text;
      }
    }
    return '';
  }
}

export const linkedinAdapter = new LinkedInAdapter();
