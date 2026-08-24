import type { ApplicationState } from '@/types/application';

/**
 * Жизненный цикл заявки. Важно: в `submitted` можно попасть только из `ready` и
 * только через явное подтверждение пользователя (см. docs/security.md).
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
    super(`Недопустимый переход заявки: ${from} -> ${to}`);
    this.name = 'ApplicationStateError';
  }
}

export function assertApplicationTransition(from: ApplicationState, to: ApplicationState): void {
  if (!canTransitionApplication(from, to)) throw new ApplicationStateError(from, to);
}
