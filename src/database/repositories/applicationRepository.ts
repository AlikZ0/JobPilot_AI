import { getDb } from '../db';
import {
  applicationSchema,
  type Application,
  type ApplicationEvent,
  type ApplicationEventType,
  type ApplicationOutcome,
  type ApplicationState,
} from '@/types/application';
import { assertApplicationTransition } from '@/core/state/applicationState';
import { stampsFor } from '@/core/pipeline/funnel';
import { createId } from '@/utils/id';
import { getJob } from './jobRepository';
import { recordSubmission } from './submissionRepository';

export async function createApplication(jobId: string): Promise<Application> {
  const existing = await getApplicationByJob(jobId);
  if (existing && existing.state !== 'cancelled') return existing;
  const now = Date.now();
  const application = applicationSchema.parse({
    id: createId('app'),
    jobId,
    state: 'draft',
    createdAt: now,
    updatedAt: now,
  });
  await getDb().applications.put(application);
  await logApplicationEvent(application.id, jobId, 'created', 'Создан черновик заявки');
  return application;
}

export async function getApplication(id: string): Promise<Application | null> {
  const row = await getDb().applications.get(id);
  return row ? applicationSchema.parse(row) : null;
}

export async function getApplicationByJob(jobId: string): Promise<Application | null> {
  const rows = await getDb().applications.where('jobId').equals(jobId).toArray();
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows[0] ? applicationSchema.parse(rows[0]) : null;
}

export async function listApplications(states?: ApplicationState[]): Promise<Application[]> {
  let rows = await getDb().applications.toArray();
  if (states?.length) rows = rows.filter((row) => states.includes(row.state));
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows.map((row) => applicationSchema.parse(row));
}

export async function updateApplication(
  id: string,
  patch: Partial<Application>,
): Promise<Application> {
  const current = await getApplication(id);
  if (!current) throw new Error(`Заявка не найдена: ${id}`);
  if (patch.state && patch.state !== current.state) {
    assertApplicationTransition(current.state, patch.state);
  }
  const next = applicationSchema.parse({ ...current, ...patch, id, updatedAt: Date.now() });
  await getDb().applications.put(next);
  if (patch.state && patch.state !== current.state) {
    await logApplicationEvent(
      id,
      current.jobId,
      'state_changed',
      `${current.state} → ${patch.state}`,
    );
  }
  return next;
}

/**
 * Отметка отправки по клику на экране проверки. `confirmedByUser` должен
 * приходить от реального клика — программно его выставлять нельзя.
 */
export async function markSubmitted(id: string, confirmedByUser: boolean): Promise<Application> {
  if (!confirmedByUser) {
    throw new Error(
      'Заявку можно пометить отправленной только после явного подтверждения пользователя.',
    );
  }
  const application = await updateApplication(id, {
    state: 'submitted',
    submittedAt: Date.now(),
    submittedByUser: true,
    submissionSource: 'manual',
  });
  await logApplicationEvent(
    id,
    application.jobId,
    'submit_confirmed',
    'Пользователь подтвердил отправку',
  );
  // Подтверждённая отправка сразу попадает в журнал откликов — он единая лента
  // и для ручных подтверждений, и для того, что заметила автоматика.
  const job = await getJob(application.jobId);
  await recordSubmission({
    jobId: application.jobId,
    applicationId: application.id,
    at: application.submittedAt ?? Date.now(),
    source: 'manual',
    signal: 'user_confirmed',
    ...(job ? { url: job.url, title: job.title, company: job.company, score: job.score } : {}),
  });
  return application;
}

/**
 * Отметка отправки по наблюдению: пользователь сам нажал «Откликнуться» на
 * сайте, а content-скрипт это заметил. JobPilot по-прежнему ничего не
 * отправляет — он фиксирует уже случившееся действие человека.
 *
 * Отличается от `markSubmitted` только источником: `submissionSource: 'auto'`.
 * Именно по этому полю интерфейс показывает, что отметку можно откатить, если
 * автоматика ошиблась.
 */
export async function markSubmittedAutomatically(
  id: string,
  evidence: { signal: string; url: string; at?: number },
): Promise<Application> {
  const current = await getApplication(id);
  if (!current) throw new Error(`Заявка не найдена: ${id}`);
  if (current.state === 'submitted') return current;

  const application = await updateApplication(id, {
    state: 'submitted',
    submittedAt: evidence.at ?? Date.now(),
    submittedByUser: true,
    submissionSource: 'auto',
  });
  await logApplicationEvent(
    id,
    application.jobId,
    'submit_confirmed',
    'Автоматика заметила отправку на сайте',
    { signal: evidence.signal, url: evidence.url },
  );
  return application;
}

/**
 * Откат ошибочной автоматической отметки. Подтверждённую человеком отправку
 * отменить нельзя: это его слово, а не догадка программы.
 */
export async function revertAutoSubmission(id: string): Promise<Application> {
  const current = await getApplication(id);
  if (!current) throw new Error(`Заявка не найдена: ${id}`);
  if (current.state !== 'submitted' || current.submissionSource !== 'auto') {
    throw new Error('Откатить можно только автоматическую отметку об отправке.');
  }
  const application = await updateApplication(id, {
    state: 'ready',
    submittedAt: null,
    submittedByUser: false,
    submissionSource: 'manual',
  });
  await logApplicationEvent(
    id,
    application.jobId,
    'user_edited',
    'Пользователь отменил автоматическую отметку об отправке',
  );
  return application;
}

/**
 * Отметка того, что ответил работодатель. Ставит её всегда человек: узнать это
 * расширению неоткуда — письма оно не читает.
 */
export async function setApplicationOutcome(
  id: string,
  outcome: ApplicationOutcome,
): Promise<Application> {
  const current = await getApplication(id);
  if (!current) throw new Error(`Заявка не найдена: ${id}`);
  if (current.submittedAt === null) {
    throw new Error('Отметить ответ можно только у отправленной заявки.');
  }

  const now = Date.now();
  const application = await updateApplication(id, {
    outcome,
    outcomeAt: stampsFor(outcome, current.outcomeAt, now),
    // Ответ пришёл — догонять больше некого.
    ...(outcome === 'awaiting' ? {} : { followUpAt: null }),
  });
  await logApplicationEvent(
    id,
    application.jobId,
    'outcome_changed',
    `${current.outcome} → ${outcome}`,
  );
  return application;
}

/** Когда напомнить написать повторно. `null` снимает напоминание. */
export async function setFollowUp(id: string, at: number | null): Promise<Application> {
  const application = await updateApplication(id, { followUpAt: at });
  await logApplicationEvent(
    id,
    application.jobId,
    'follow_up_set',
    at === null ? 'напоминание снято' : `напомнить ${new Date(at).toLocaleDateString('ru-RU')}`,
  );
  return application;
}

export async function deleteApplication(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.applications, db.applicationEvents], async () => {
    await db.applications.delete(id);
    await db.applicationEvents.where('applicationId').equals(id).delete();
  });
}

export async function logApplicationEvent(
  applicationId: string,
  jobId: string,
  type: ApplicationEventType,
  message: string,
  data?: Record<string, unknown>,
): Promise<ApplicationEvent> {
  const event: ApplicationEvent = {
    id: createId('evt'),
    applicationId,
    jobId,
    at: Date.now(),
    type,
    message,
    ...(data ? { data } : {}),
  };
  await getDb().applicationEvents.put(event);
  return event;
}

export async function listApplicationEvents(applicationId: string): Promise<ApplicationEvent[]> {
  const rows = await getDb()
    .applicationEvents.where('applicationId')
    .equals(applicationId)
    .toArray();
  rows.sort((a, b) => a.at - b.at);
  return rows;
}

export async function bulkPutApplications(applications: Application[]): Promise<void> {
  await getDb().applications.bulkPut(applications.map((a) => applicationSchema.parse(a)));
}
