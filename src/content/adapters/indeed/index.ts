import type { ExtractedJob, JobSummary } from '@/types/job';
import { extractJobFromDocument, type AdapterHints } from '@/core/extraction/pipeline';
import { elementText } from '@/core/extraction/html';
import { normalizeWhitespace, uniqueBy } from '@/utils/text';
import { absoluteUrl, hostnameOf, normalizeUrl } from '@/utils/url';
import type { AdapterContext, JobSiteAdapter } from '../types';

/** Indeed runs on many country domains: indeed.com, de.indeed.com, indeed.co.uk. */
export class IndeedAdapter implements JobSiteAdapter {
  readonly id = 'indeed';
  readonly label = 'Indeed';

  canHandle(url: string): boolean {
    const host = hostnameOf(url);
    return /(^|\.)indeed\.[a-z.]{2,6}$/.test(host);
  }

  isJobPage(context: AdapterContext): boolean {
    if (/\/(viewjob|job)\b/.test(context.url) || /[?&](jk|vjk)=/.test(context.url)) return true;
    return Boolean(context.doc.querySelector('#jobDescriptionText'));
  }

  isListingPage(context: AdapterContext): boolean {
    return (
      /\/jobs\b/.test(context.url) ||
      context.doc.querySelectorAll('a.jcs-JobTitle, [data-testid="job-title"]').length > 2
    );
  }

  async extractJob(context: AdapterContext): Promise<ExtractedJob> {
    const { doc } = context;
    const hints: AdapterHints = {
      title: this.text(doc, [
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        '.jobsearch-JobInfoHeader-title',
        'h1.icl-u-xs-mb--xs',
      ]),
      company: this.text(doc, [
        '[data-testid="inlineHeader-companyName"]',
        '[data-company-name="true"]',
        '.jobsearch-CompanyInfoContainer a',
      ]),
      location: this.text(doc, [
        '[data-testid="inlineHeader-companyLocation"]',
        '[data-testid="job-location"]',
        '.jobsearch-JobInfoHeader-subtitle div:last-child',
      ]),
      description: elementText(doc.querySelector('#jobDescriptionText')),
      salaryText: this.text(doc, [
        '#salaryInfoAndJobType',
        '[data-testid="attribute_snippet_testid"]',
        '.salary-snippet-container',
      ]),
    };
    return extractJobFromDocument(
      {
        doc,
        url: context.url,
        maxDescriptionChars: context.maxDescriptionChars,
        source: this.id,
      },
      hints,
    );
  }

  async extractJobsFromListing(context: AdapterContext): Promise<JobSummary[]> {
    const cards = Array.from(
      context.doc.querySelectorAll('div.job_seen_beacon, td.resultContent, div.cardOutline'),
    );
    const summaries: JobSummary[] = [];
    for (const card of cards) {
      const anchor = card.querySelector<HTMLAnchorElement>('a.jcs-JobTitle, h2 a, a[data-jk]');
      const href = anchor?.getAttribute('href');
      if (!href) continue;
      summaries.push({
        title: this.text(card, ['[data-testid="job-title"]', 'h2 span', 'h2']),
        company: this.text(card, ['[data-testid="company-name"]', '.companyName']),
        location: this.text(card, ['[data-testid="text-location"]', '.companyLocation']),
        url: normalizeUrl(absoluteUrl(href, context.url)),
        listingId: anchor?.getAttribute('data-jk') ?? '',
        salaryHint: this.text(card, [
          '[data-testid="attribute_snippet_testid"]',
          '.salary-snippet-container',
        ]),
      });
    }
    return uniqueBy(summaries, (summary) => summary.url).slice(0, 200);
  }

  private text(root: ParentNode, selectors: string[]): string {
    for (const selector of selectors) {
      const value = normalizeWhitespace(root.querySelector(selector)?.textContent ?? '');
      if (value) return value;
    }
    return '';
  }
}

export const indeedAdapter = new IndeedAdapter();
