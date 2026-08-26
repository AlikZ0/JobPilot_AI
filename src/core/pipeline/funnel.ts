import {
  OUTCOME_STAGES,
  type Application,
  type ApplicationOutcome,
  type OutcomeStage,
} from '@/types/application';

/**
 * Воронка откликов: сколько заявок отправлено и до какой ступени они дошли.
 *
 * Считается по отметкам `outcomeAt`, а не по текущему `outcome`: заявка,
 * дошедшая до интервью и получившая отказ, всё равно была ответом и была
 * интервью. Иначе конверсия занижалась бы ровно на отказы, то есть на
 * большинство откликов.
 */

/** Достижение ступени подразумевает более ранние: до интервью без ответа не доходят. */
const IMPLIED: Record<OutcomeStage, OutcomeStage[]> = {
  replied: ['replied'],
  interview: ['replied', 'interview'],
  offer: ['replied', 'offer'],
};

/**
 * Отметки, которые надо проставить при переходе на ступень. Отказ ничего не
 * подразумевает: молчание тоже заканчивается отказом, и приписывать ему ответ
 * работодателя было бы выдумкой.
 */
export function stampsFor(
  outcome: ApplicationOutcome,
  current: Partial<Record<ApplicationOutcome, number>>,
  at: number,
): Partial<Record<ApplicationOutcome, number>> {
  const stamps: Partial<Record<ApplicationOutcome, number>> = { ...current };
  const reached =
    outcome === 'awaiting' ? [] : outcome === 'rejected' ? ['rejected'] : IMPLIED[outcome];
  for (const stage of reached as ApplicationOutcome[]) {
    // Первое достижение ступени не переписываем: важна дата, когда это случилось.
    if (stamps[stage] === undefined) stamps[stage] = at;
  }
  return stamps;
}

export function reachedStage(application: Application, stage: OutcomeStage): boolean {
  return application.outcomeAt[stage] !== undefined;
}

export interface FunnelStep {
  stage: OutcomeStage | 'submitted';
  count: number;
  /** Доля от отправленных, 0–100. У самой отправки всегда 100. */
  share: number;
}

export interface Funnel {
  submitted: number;
  steps: FunnelStep[];
  rejected: number;
  /** Отправлены, ответа нет и отказа тоже — эти ещё в игре. */
  awaiting: number;
}

export function buildFunnel(applications: Application[]): Funnel {
  const sent = applications.filter((application) => application.submittedAt !== null);
  const submitted = sent.length;
  const share = (count: number) => (submitted === 0 ? 0 : Math.round((count / submitted) * 100));

  const steps: FunnelStep[] = [
    { stage: 'submitted', count: submitted, share: submitted === 0 ? 0 : 100 },
    ...OUTCOME_STAGES.map((stage) => {
      const count = sent.filter((application) => reachedStage(application, stage)).length;
      return { stage, count, share: share(count) };
    }),
  ];

  return {
    submitted,
    steps,
    rejected: sent.filter((application) => application.outcome === 'rejected').length,
    awaiting: sent.filter(
      (application) => application.outcome === 'awaiting' || application.outcome === 'replied',
    ).length,
  };
}

/**
 * Заявки, по которым пора написать повторно. Напоминание ставит человек, и
 * гасится оно любым ответом: догонять того, кто уже ответил, незачем.
 */
export function dueFollowUps(applications: Application[], now: number): Application[] {
  return applications
    .filter(
      (application) =>
        application.followUpAt !== null &&
        application.followUpAt <= now &&
        application.outcome === 'awaiting',
    )
    .sort((a, b) => (a.followUpAt ?? 0) - (b.followUpAt ?? 0));
}
