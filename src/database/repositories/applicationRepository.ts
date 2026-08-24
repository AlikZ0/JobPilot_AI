import { getDb } from '../db';
import {
  applicationSchema,
  type Application,
  type ApplicationEvent,
  type ApplicationEventType,
  type ApplicationState,
} from '@/types/application';
import { assertApplicationTransition } from '@/core/state/applicationState';
import { createId } from '@/utils/id';

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
 * Единственный путь в `submitted`. `confirmedByUser` должен приходить от
 * реального клика на экране проверки — программно его выставлять нельзя.
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
  });
  await logApplicationEvent(
    id,
    application.jobId,
    'submit_confirmed',
    'Пользователь подтвердил отправку',
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
