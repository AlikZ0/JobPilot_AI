import type { JobState } from '@/types/job';

/**
 * Allowed job lifecycle transitions. Anything not listed here is rejected so a
 * bug cannot, for example, move a job straight from `discovered` to `submitted`.
 */
export const JOB_TRANSITIONS: Record<JobState, readonly JobState[]> = {
  discovered: ['queued', 'analyzing', 'saved', 'rejected', 'error'],
  queued: ['analyzing', 'discovered', 'rejected', 'error'],
  analyzing: ['analyzed', 'error', 'rejected'],
  analyzed: ['saved', 'application_preparing', 'rejected', 'analyzing', 'error'],
  saved: ['application_preparing', 'analyzing', 'rejected', 'analyzed', 'error'],
  application_preparing: ['application_ready', 'saved', 'error', 'rejected'],
  application_ready: ['submitted', 'application_preparing', 'rejected', 'error'],
  submitted: ['rejected'],
  rejected: ['saved', 'analyzed', 'discovered'],
  error: ['queued', 'analyzing', 'discovered', 'rejected'],
};

export function canTransitionJob(from: JobState, to: JobState): boolean {
  if (from === to) return true;
  return JOB_TRANSITIONS[from].includes(to);
}

export class JobStateError extends Error {
  constructor(from: JobState, to: JobState) {
    super(`Invalid job transition: ${from} -> ${to}`);
    this.name = 'JobStateError';
  }
}

export function assertJobTransition(from: JobState, to: JobState): void {
  if (!canTransitionJob(from, to)) throw new JobStateError(from, to);
}

/** States that mean the job no longer needs analysis work. */
export const TERMINAL_JOB_STATES: readonly JobState[] = ['submitted', 'rejected'];
