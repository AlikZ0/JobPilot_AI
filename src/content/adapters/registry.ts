import { genericAdapter } from './generic';
import { glassdoorAdapter } from './glassdoor';
import { indeedAdapter } from './indeed';
import { linkedinAdapter } from './linkedin';
import type { JobSiteAdapter } from './types';

/** Ordered: the first adapter that claims the URL wins, generic is last. */
export const ADAPTERS: JobSiteAdapter[] = [linkedinAdapter, indeedAdapter, glassdoorAdapter];

export function resolveAdapter(url: string): JobSiteAdapter {
  return ADAPTERS.find((adapter) => adapter.canHandle(url)) ?? genericAdapter;
}

export function listAdapters(): JobSiteAdapter[] {
  return [...ADAPTERS, genericAdapter];
}

export { genericAdapter };
export type { JobSiteAdapter } from './types';
