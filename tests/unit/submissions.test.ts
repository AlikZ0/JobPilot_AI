import { beforeEach, describe, expect, it } from 'vitest';
import { JobPilotDatabase, getDb, setDb } from '@/database/db';
import { upsertExtractedJob, updateJob } from '@/database/repositories/jobRepository';
import {
  createApplication,
  listApplicationEvents,
  markSubmitted,
  markSubmittedAutomatically,
  revertAutoSubmission,
  updateApplication,
} from '@/database/repositories/applicationRepository';
import {
  deleteSubmission,
  getSubmissionByJob,
  listSubmissions,
  recordSubmission,
  summarizeSubmissions,
} from '@/database/repositories/submissionRepository';
import { exportAllData, importData } from '@/database/transfer';
import { DAY_MS } from '@/utils/time';
import { makeJob } from '../fixtures/jobs';

let counter = 0;

beforeEach(async () => {
  counter += 1;
  setDb(new JobPilotDatabase(`jobpilot-submissions-${counter}`));
  await getDb().open();
});

async function seedJob(overrides: Parameters<typeof makeJob>[0] = {}) {
  const { job } = await upsertExtractedJob(makeJob(overrides));
  return job;
}

describe('журнал откликов', () => {
  it('записывает отклик со снимком вакансии', async () => {
    const job = await seedJob({ title: 'Node.js Developer', company: 'Example' });
    const record = await recordSubmission({
      jobId: job.id,
      source: 'auto',
      signal: 'form_submit',
      url: 'https://jobs.example.com/1?utm_source=x',
      title: job.title,
      company: job.company,
      score: 91,
    });

    expect(record.jobId).toBe(job.id);
    expect(record.title).toBe('Node.js Developer');
    expect(record.hostname).toBe('jobs.example.com');
    expect(record.score).toBe(91);
    expect(await listSubmissions()).toHaveLength(1);
  });

  it('не плодит записи, когда автоматика срабатывает дважды по одной вакансии', async () => {
    const job = await seedJob();
    await recordSubmission({ jobId: job.id, source: 'auto', signal: 'form_submit' });
    await recordSubmission({ jobId: job.id, source: 'auto', signal: 'success_page' });

    const rows = await listSubmissions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.signal).toBe('success_page');
  });

  it('не понижает подтверждённый пользователем отклик до автоматического', async () => {
    const job = await seedJob();
    await recordSubmission({ jobId: job.id, source: 'manual', signal: 'user_confirmed' });
    await recordSubmission({ jobId: job.id, source: 'auto', signal: 'site_marker' });

    const record = await getSubmissionByJob(job.id);
    expect(record?.source).toBe('manual');
    expect(record?.signal).toBe('user_confirmed');
  });

  it('заводит отдельную запись, если между откликами прошло больше суток', async () => {
    const job = await seedJob();
    const now = Date.now();
    await recordSubmission({ jobId: job.id, source: 'auto', signal: 'form_submit', at: now });
    await recordSubmission({
      jobId: job.id,
      source: 'auto',
      signal: 'form_submit',
      at: now - 2 * DAY_MS,
    });
    expect(await listSubmissions()).toHaveLength(2);
  });

  it('подтверждение отправки на экране проверки попадает в журнал', async () => {
    const job = await seedJob({ title: 'Backend Engineer' });
    await updateJob(job.id, { state: 'saved' });
    const application = await createApplication(job.id);
    await updateApplication(application.id, { state: 'review' });
    await updateApplication(application.id, { state: 'ready' });

    await markSubmitted(application.id, true);

    const record = await getSubmissionByJob(job.id);
    expect(record?.source).toBe('manual');
    expect(record?.signal).toBe('user_confirmed');
    expect(record?.applicationId).toBe(application.id);
    expect(record?.title).toBe('Backend Engineer');
  });

  it('считает сводку по периодам и отделяет автоматические записи', async () => {
    const first = await seedJob({ url: 'https://jobs.example.com/1', title: 'A' });
    const second = await seedJob({ url: 'https://jobs.example.com/2', title: 'B' });
    const third = await seedJob({ url: 'https://jobs.example.com/3', title: 'C' });
    const now = Date.now();

    await recordSubmission({ jobId: first.id, source: 'auto', signal: 'form_submit', at: now });
    await recordSubmission({
      jobId: second.id,
      source: 'manual',
      signal: 'user_confirmed',
      at: now - 3 * DAY_MS,
    });
    await recordSubmission({
      jobId: third.id,
      source: 'auto',
      signal: 'site_marker',
      at: now - 20 * DAY_MS,
    });

    const summary = await summarizeSubmissions(now);
    expect(summary.total).toBe(3);
    expect(summary.week).toBe(2);
    expect(summary.month).toBe(3);
    expect(summary.today).toBe(1);
    expect(summary.auto).toBe(2);
  });

  it('автоматика отмечает заявку отправленной прямо из черновика', async () => {
    const job = await seedJob();
    const application = await createApplication(job.id);

    const submitted = await markSubmittedAutomatically(application.id, {
      signal: 'form_submit',
      url: 'https://jobs.example.com/1',
    });

    expect(submitted.state).toBe('submitted');
    expect(submitted.submissionSource).toBe('auto');
    // Кнопку на сайте нажал человек — это по-прежнему его отправка.
    expect(submitted.submittedByUser).toBe(true);
    expect(submitted.submittedAt).toBeTypeOf('number');

    const events = await listApplicationEvents(application.id);
    expect(events.some((event) => event.type === 'submit_confirmed')).toBe(true);
  });

  it('повторный сигнал не перезаписывает уже отправленную заявку', async () => {
    const job = await seedJob();
    const application = await createApplication(job.id);
    const first = await markSubmittedAutomatically(application.id, {
      signal: 'form_submit',
      url: 'https://jobs.example.com/1',
    });
    const second = await markSubmittedAutomatically(application.id, {
      signal: 'success_page',
      url: 'https://jobs.example.com/1',
    });
    expect(second.submittedAt).toBe(first.submittedAt);
  });

  it('ошибочную автоматическую отметку можно откатить', async () => {
    const job = await seedJob();
    const application = await createApplication(job.id);
    await markSubmittedAutomatically(application.id, {
      signal: 'site_marker',
      url: 'https://jobs.example.com/1',
    });

    const reverted = await revertAutoSubmission(application.id);
    expect(reverted.state).toBe('ready');
    expect(reverted.submittedAt).toBeNull();
    expect(reverted.submittedByUser).toBe(false);
  });

  it('подтверждённую человеком отправку откатить нельзя', async () => {
    const job = await seedJob();
    const application = await createApplication(job.id);
    await updateApplication(application.id, { state: 'review' });
    await updateApplication(application.id, { state: 'ready' });
    await markSubmitted(application.id, true);

    await expect(revertAutoSubmission(application.id)).rejects.toThrow(
      /только автоматическую отметку/,
    );
  });

  it('запись можно удалить — автоматика ошибается, и это должно быть поправимо', async () => {
    const job = await seedJob();
    const record = await recordSubmission({
      jobId: job.id,
      source: 'auto',
      signal: 'form_submit',
    });
    await deleteSubmission(record.id);
    expect(await listSubmissions()).toHaveLength(0);
  });

  it('журнал переживает экспорт и импорт', async () => {
    const job = await seedJob();
    await recordSubmission({
      jobId: job.id,
      source: 'auto',
      signal: 'form_submit',
      url: 'https://jobs.example.com/1',
    });

    const bundle = await exportAllData();
    expect(bundle.submissions).toHaveLength(1);

    counter += 1;
    setDb(new JobPilotDatabase(`jobpilot-submissions-${counter}`));
    await getDb().open();

    const summary = await importData(bundle, { mode: 'merge' });
    expect(summary.submissions).toBe(1);
    expect(await listSubmissions()).toHaveLength(1);
  });

  it('импорт старого файла без журнала не падает', async () => {
    const bundle = await exportAllData();
    const legacy = { ...bundle } as Record<string, unknown>;
    delete legacy.submissions;

    const summary = await importData(legacy, { mode: 'merge' });
    expect(summary.submissions).toBe(0);
  });
});
