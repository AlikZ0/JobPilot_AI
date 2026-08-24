import type { ApplicationState } from '@/types/application';

/**
 * Жизненный цикл заявки.
 *
 * В `submitted` ведут ровно два пути, и оба означают «отправил человек»:
 * подтверждение на экране проверки и замеченная на сайте отправка формы
 * (`markSubmittedAutomatically`). Сам JobPilot заявку не отправляет никогда —
 * см. docs/security.md.
 *
 * Отправить отклик можно на любом шаге подготовки: человек часто дозаполняет
 * форму руками и жмёт «Откликнуться», не доводя черновик до `ready`. Поэтому
 * переход разрешён из всех рабочих состояний, кроме отменённого — там решение
 * пользователя было обратным.
 */
export const APPLICATION_TRANSITIONS: Record<ApplicationState, readonly ApplicationState[]> = {
  draft: ['analyzing', 'filling', 'review', 'submitted', 'cancelled', 'failed'],
  analyzing: ['filling', 'review', 'submitted', 'draft', 'failed', 'cancelled'],
  filling: ['review', 'submitted', 'draft', 'failed', 'cancelled'],
  review: ['ready', 'filling', 'submitted', 'draft', 'failed', 'cancelled'],
  ready: ['submitted', 'review', 'filling', 'failed', 'cancelled'],
  // Единственный выход — откат ошибочной автоматической отметки в `ready`.
  submitted: ['ready'],
  failed: ['draft', 'filling', 'review', 'submitted', 'cancelled'],
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
