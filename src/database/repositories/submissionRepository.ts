import { getDb } from '../db';
import {
  submissionSchema,
  type SubmissionRecord,
  type SubmissionSummary,
} from '@/types/submission';
import { createId } from '@/utils/id';
import { hostnameOf } from '@/utils/url';
import { DAY_MS, startOfDay } from '@/utils/time';

/** Один и тот же отклик автоматика может заметить дважды: и по submit, и по странице «спасибо». */
const DEDUPE_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface RecordSubmissionInput {
  jobId: string;
  applicationId?: string | null;
  at?: number;
  source: SubmissionRecord['source'];
  signal: SubmissionRecord['signal'];
  url?: string;
  title?: string;
  company?: string;
  score?: number | null;
  note?: string;
}

/**
 * Добавляет отклик в журнал. Повторное срабатывание по той же вакансии в
 * пределах 12 часов не плодит записи, а уточняет уже существующую: подтверждение
 * пользователя всегда перебивает автоматическую догадку.
 */
export async function recordSubmission(input: RecordSubmissionInput): Promise<SubmissionRecord> {
  const at = input.at ?? Date.now();
  const existing = (await getDb().submissions.where('jobId').equals(input.jobId).toArray())
    .map((row) => submissionSchema.parse(row))
    .find((row) => Math.abs(row.at - at) < DEDUPE_WINDOW_MS);

  const base: SubmissionRecord = submissionSchema.parse({
    id: existing?.id ?? createId('sub'),
    jobId: input.jobId,
    applicationId: input.applicationId ?? existing?.applicationId ?? null,
    at: existing ? Math.min(existing.at, at) : at,
    source: input.source,
    signal: input.signal,
    url: input.url ?? existing?.url ?? '',
    hostname: hostnameOf(input.url ?? existing?.url ?? ''),
    title: input.title || (existing?.title ?? ''),
    company: input.company || (existing?.company ?? ''),
    score: input.score ?? existing?.score ?? null,
    note: input.note ?? existing?.note ?? '',
  });

  // Подтверждённый пользователем факт не понижается до автоматического.
  const next =
    existing && existing.source === 'manual' && input.source === 'auto'
      ? { ...base, source: existing.source, signal: existing.signal }
      : base;

  await getDb().submissions.put(next);
  return next;
}

export async function listSubmissions(limit = 500): Promise<SubmissionRecord[]> {
  const rows = await getDb().submissions.toArray();
  rows.sort((a, b) => b.at - a.at);
  return rows.slice(0, limit).map((row) => submissionSchema.parse(row));
}

export async function getSubmissionByJob(jobId: string): Promise<SubmissionRecord | null> {
  const rows = await getDb().submissions.where('jobId').equals(jobId).toArray();
  rows.sort((a, b) => b.at - a.at);
  return rows[0] ? submissionSchema.parse(rows[0]) : null;
}

export async function updateSubmission(
  id: string,
  patch: Partial<SubmissionRecord>,
): Promise<SubmissionRecord> {
  const current = await getDb().submissions.get(id);
  if (!current) throw new Error(`Отклик не найден: ${id}`);
  const next = submissionSchema.parse({ ...current, ...patch, id });
  await getDb().submissions.put(next);
  return next;
}

export async function deleteSubmission(id: string): Promise<void> {
  await getDb().submissions.delete(id);
}

export async function summarizeSubmissions(now = Date.now()): Promise<SubmissionSummary> {
  const rows = await listSubmissions(2000);
  const dayStart = startOfDay(now);
  return {
    today: rows.filter((row) => row.at >= dayStart).length,
    week: rows.filter((row) => row.at >= now - 7 * DAY_MS).length,
    month: rows.filter((row) => row.at >= now - 30 * DAY_MS).length,
    total: rows.length,
    auto: rows.filter((row) => row.source === 'auto').length,
  };
}

export async function bulkPutSubmissions(records: SubmissionRecord[]): Promise<void> {
  await getDb().submissions.bulkPut(records.map((row) => submissionSchema.parse(row)));
}
