import { genericAdapter } from './generic';
import { glassdoorAdapter } from './glassdoor';
import { indeedAdapter } from './indeed';
import { linkedinAdapter } from './linkedin';
import type { JobSiteAdapter } from './types';

/** Порядок важен: побеждает первый адаптер, принявший URL; общий адаптер — последний. */
export const ADAPTERS: JobSiteAdapter[] = [linkedinAdapter, indeedAdapter, glassdoorAdapter];

export function resolveAdapter(url: string): JobSiteAdapter {
  return ADAPTERS.find((adapter) => adapter.canHandle(url)) ?? genericAdapter;
}

export function listAdapters(): JobSiteAdapter[] {
  return [...ADAPTERS, genericAdapter];
}

export { genericAdapter };
export type { JobSiteAdapter } from './types';
