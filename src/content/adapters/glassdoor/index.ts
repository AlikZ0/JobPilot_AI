import type { ExtractedJob, JobSummary } from '@/types/job';
import { extractJobFromDocument, type AdapterHints } from '@/core/extraction/pipeline';
import { elementText } from '@/core/extraction/html';
import { normalizeWhitespace, uniqueBy } from '@/utils/text';
import { absoluteUrl, hostnameOf, normalizeUrl } from '@/utils/url';
import type { AdapterContext, JobSiteAdapter } from '../types';

export class GlassdoorAdapter implements JobSiteAdapter {
  readonly id = 'glassdoor';
  readonly label = 'Glassdoor';

  canHandle(url: string): boolean {
    return /(^|\.)glassdoor\.[a-z.]{2,6}$/.test(hostnameOf(url));
  }

  isJobPage(context: AdapterContext): boolean {
    if (/\/job-listing\//.test(context.url)) return true;
    return Boolean(context.doc.querySelector('[class*="JobDetails_jobDescription"]'));
  }

  isListingPage(context: AdapterContext): boolean {
    return (
      /\/Job\/|\/Jobs\//.test(context.url) ||
      context.doc.querySelectorAll('[data-test="job-link"], li[data-test="jobListing"]').length > 2
    );
  }

  async extractJob(context: AdapterContext): Promise<ExtractedJob> {
    const { doc } = context;
    const hints: AdapterHints = {
      title: this.text(doc, ['[data-test="job-title"]', '[class*="JobDetails_jobTitle"]', 'h1']),
      company: this.text(doc, [
        '[data-test="employer-name"]',
        '[class*="EmployerProfile_employerName"]',
      ]),
      location: this.text(doc, ['[data-test="location"]', '[class*="JobDetails_location"]']),
      description: elementText(
        doc.querySelector('[class*="JobDetails_jobDescription"], #JobDescriptionContainer'),
      ),
      salaryText: this.text(doc, ['[data-test="detailSalary"]', '[class*="SalaryEstimate"]']),
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
      context.doc.querySelectorAll('li[data-test="jobListing"], li.react-job-listing'),
    );
    const summaries: JobSummary[] = [];
    for (const card of cards) {
      const anchor = card.querySelector<HTMLAnchorElement>('a[data-test="job-link"], a.jobLink');
      const href = anchor?.getAttribute('href');
      if (!href) continue;
      summaries.push({
        title: normalizeWhitespace(anchor?.textContent ?? ''),
        company: this.text(card, [
          '[class*="EmployerProfile_compactEmployerName"]',
          '.employerName',
        ]),
        location: this.text(card, ['[data-test="emp-location"]', '.loc']),
        url: normalizeUrl(absoluteUrl(href, context.url)),
        listingId: card.getAttribute('data-jobid') ?? '',
        salaryHint: this.text(card, ['[data-test="detailSalary"]', '.salary-estimate']),
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

export const glassdoorAdapter = new GlassdoorAdapter();
