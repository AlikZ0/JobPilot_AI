import type { ExtractedJob, JobSummary } from '@/types/job';
import type { DetectedFormField, FieldMapping, FillResult } from '@/types/application';

export interface AdapterContext {
  doc: Document;
  url: string;
  maxDescriptionChars: number;
}

/**
 * One adapter per job board. Site-specific DOM knowledge must never leak into
 * shared code — everything a site needs lives inside its own adapter folder.
 */
export interface JobSiteAdapter {
  readonly id: string;
  readonly label: string;
  canHandle(url: string): boolean;
  /** True when the current page shows a single posting. */
  isJobPage(context: AdapterContext): boolean;
  /** True when the current page shows a list of postings. */
  isListingPage(context: AdapterContext): boolean;
  extractJob(context: AdapterContext): Promise<ExtractedJob>;
  extractJobsFromListing(context: AdapterContext): Promise<JobSummary[]>;
  /** Optional site-specific form handling; the generic filler is used otherwise. */
  fillApplication?(
    context: AdapterContext,
    mappings: FieldMapping[],
    fields: DetectedFormField[],
  ): Promise<FillResult>;
}
