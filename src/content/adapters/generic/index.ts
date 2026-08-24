import type { ExtractedJob, JobSummary } from '@/types/job';
import { extractJobFromDocument } from '@/core/extraction/pipeline';
import { looksLikeJobPage } from '@/core/extraction/heuristics';
import { listingIdFromUrl } from '@/core/extraction/fingerprint';
import { normalizeWhitespace, uniqueBy } from '@/utils/text';
import { absoluteUrl, hostnameOf, normalizeUrl } from '@/utils/url';
import type { AdapterContext, JobSiteAdapter } from '../types';

/** Links that look like a job posting on an unknown site. */
const JOB_LINK_RE =
  /\/(jobs?|vacancy|vacancies|position|career[s]?|opening[s]?|viewjob|job-detail)[/\-?=]/i;

const LISTING_SIGNALS = [
  '[class*="job-card" i]',
  '[class*="jobCard" i]',
  '[data-testid*="job-card" i]',
  '[class*="result" i][class*="job" i]',
  'ul[class*="jobs" i] li',
];

export class GenericJobAdapter implements JobSiteAdapter {
  readonly id = 'generic';
  readonly label = 'Generic';

  canHandle(): boolean {
    return true;
  }

  isJobPage(context: AdapterContext): boolean {
    return looksLikeJobPage(context.doc);
  }

  isListingPage(context: AdapterContext): boolean {
    return this.collectLinks(context).length >= 3;
  }

  async extractJob(context: AdapterContext): Promise<ExtractedJob> {
    return extractJobFromDocument({
      doc: context.doc,
      url: context.url,
      maxDescriptionChars: context.maxDescriptionChars,
      source: this.id,
    });
  }

  async extractJobsFromListing(context: AdapterContext): Promise<JobSummary[]> {
    return this.collectLinks(context);
  }

  protected collectLinks(context: AdapterContext): JobSummary[] {
    const { doc, url } = context;
    const host = hostnameOf(url);
    const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    const summaries: JobSummary[] = [];

    for (const anchor of anchors) {
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      const absolute = absoluteUrl(href, url);
      if (hostnameOf(absolute) !== host) continue;
      if (!JOB_LINK_RE.test(absolute)) continue;
      const title = normalizeWhitespace(anchor.textContent ?? '');
      if (title.length < 3 || title.length > 160) continue;
      const card = anchor.closest(LISTING_SIGNALS.join(',')) ?? anchor.closest('li,article,div');
      summaries.push({
        title,
        company: this.textFrom(card, ['[class*="company" i]', '[data-testid*="company" i]']),
        location: this.textFrom(card, ['[class*="location" i]', '[data-testid*="location" i]']),
        url: normalizeUrl(absolute),
        listingId: listingIdFromUrl(absolute),
        salaryHint: this.textFrom(card, ['[class*="salary" i]', '[class*="pay" i]']),
      });
    }
    return uniqueBy(summaries, (summary) => summary.url).slice(0, 200);
  }

  protected textFrom(root: Element | null, selectors: string[]): string {
    if (!root) return '';
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = normalizeWhitespace(element?.textContent ?? '');
      if (text && text.length <= 120) return text;
    }
    return '';
  }
}

export const genericAdapter = new GenericJobAdapter();
