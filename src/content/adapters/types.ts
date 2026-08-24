import type { ExtractedJob, JobSummary } from '@/types/job';
import type { DetectedFormField, FieldMapping, FillResult } from '@/types/application';

export interface AdapterContext {
  doc: Document;
  url: string;
  maxDescriptionChars: number;
}

/**
 * По одному адаптеру на job-сайт. Знание о DOM конкретного сайта не должно
 * протекать в общий код — всё, что нужно сайту, живёт в его папке адаптера.
 */
export interface JobSiteAdapter {
  readonly id: string;
  readonly label: string;
  canHandle(url: string): boolean;
  /** true, если текущая страница показывает одну вакансию. */
  isJobPage(context: AdapterContext): boolean;
  /** true, если текущая страница показывает список вакансий. */
  isListingPage(context: AdapterContext): boolean;
  extractJob(context: AdapterContext): Promise<ExtractedJob>;
  extractJobsFromListing(context: AdapterContext): Promise<JobSummary[]>;
  /** Необязательная обработка формы под конкретный сайт; иначе работает общий филлер. */
  fillApplication?(
    context: AdapterContext,
    mappings: FieldMapping[],
    fields: DetectedFormField[],
  ): Promise<FillResult>;
}
