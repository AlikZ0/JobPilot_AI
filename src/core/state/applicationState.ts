import type { ApplicationState } from '@/types/application';

/**
 * Application lifecycle. Note that `submitted` is only reachable from `ready`
 * and only through an explicit user confirmation (see docs/security.md).
 */
export const APPLICATION_TRANSITIONS: Record<ApplicationState, readonly ApplicationState[]> = {
  draft: ['analyzing', 'filling', 'review', 'cancelled', 'failed'],
  analyzing: ['filling', 'review', 'draft', 'failed', 'cancelled'],
  filling: ['review', 'draft', 'failed', 'cancelled'],
  review: ['ready', 'filling', 'draft', 'failed', 'cancelled'],
  ready: ['submitted', 'review', 'filling', 'failed', 'cancelled'],
  submitted: [],
  failed: ['draft', 'filling', 'review', 'cancelled'],
  cancelled: ['draft'],
};

export function canTransitionApplication(from: ApplicationState, to: ApplicationState): boolean {
  if (from === to) return true;
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export class ApplicationStateError extends Error {
  constructor(from: ApplicationState, to: ApplicationState) {
    super(`Invalid application transition: ${from} -> ${to}`);
    this.name = 'ApplicationStateError';
  }
}

export function assertApplicationTransition(from: ApplicationState, to: ApplicationState): void {
  if (!canTransitionApplication(from, to)) throw new ApplicationStateError(from, to);
}
