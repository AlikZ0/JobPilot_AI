import type { JobSummary } from './job';

export const SCAN_STATES = [
  'idle',
  'discovering',
  'running',
  'paused',
  'stopping',
  'done',
  'error',
] as const;
export type ScanState = (typeof SCAN_STATES)[number];

export interface ScanProgress {
  sessionId: string;
  state: ScanState;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentTitle: string;
  currentUrl: string;
  currentScore: number | null;
  bestScore: number | null;
  startedAt: number;
  finishedAt: number | null;
  error: string;
}

export interface ScanRequest {
  listingUrl: string;
  jobs: JobSummary[];
  maxJobs: number;
  concurrency: number;
  delayMs: number;
}

export const EMPTY_PROGRESS: ScanProgress = {
  sessionId: '',
  state: 'idle',
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  currentTitle: '',
  currentUrl: '',
  currentScore: null,
  bestScore: null,
  startedAt: 0,
  finishedAt: null,
  error: '',
};
