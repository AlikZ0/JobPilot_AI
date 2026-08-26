import { getDb } from '../db';
import {
  jobSchema,
  type ExtractedJob,
  type Job,
  type JobPriority,
  type JobState,
} from '@/types/job';
import { assertJobTransition } from '@/core/state/jobState';
import { dedupeJobs, fingerprintOf, findDuplicate } from '@/core/extraction/fingerprint';
import { createId } from '@/utils/id';
import { normalizeUrl } from '@/utils/url';

export interface UpsertResult {
  job: Job;
  created: boolean;
  duplicateOf: string | null;
}

/**
 * Сохраняет извлечённую вакансию, схлопывая дубли (в том числе с другого
 * job-сайта) в уже существующую запись.
 */
export async function upsertExtractedJob(
  extracted: ExtractedJob,
  options: { scanSessionId?: string | null; state?: JobState } = {},
): Promise<UpsertResult> {
  const db = getDb();
  const fingerprint = fingerprintOf(extracted);
  const now = Date.now();

  const byFingerprint = await db.jobs.where('fingerprint').equals(fingerprint).first();
  let existing = byFingerprint ?? null;
  let duplicateOf: string | null = null;

  if (!existing && extracted.company) {
    const sameCompany = await db.jobs.where('company').equals(extracted.company).toArray();
    const match = findDuplicate(extracted, sameCompany);
    if (match) {
      existing = match.job;
      duplicateOf = match.job.id;
    }
  }
  if (!existing && extracted.url) {
    const normalized = normalizeUrl(extracted.url);
    const all = await db.jobs.toArray();
    existing = all.find((job) => normalizeUrl(job.url) === normalized) ?? null;
  }

  if (existing) {
    const merged = jobSchema.parse({
      ...existing,
      // Оставляем то извлечение, которое дало более богатые данные.
      ...pickRicherFields(existing, extracted),
      id: existing.id,
      fingerprint: existing.fingerprint,
      updatedAt: now,
      scanSessionId: options.scanSessionId ?? existing.scanSessionId,
    });
    await db.jobs.put(merged);
    return { job: merged, created: false, duplicateOf };
  }

  const job = jobSchema.parse({
    ...extracted,
    id: createId('job'),
    fingerprint,
    state: options.state ?? 'discovered',
    discoveredAt: now,
    updatedAt: now,
    scanSessionId: options.scanSessionId ?? null,
  });
  await db.jobs.put(job);
  return { job, created: true, duplicateOf: null };
}

function pickRicherFields(existing: Job, incoming: ExtractedJob): Partial<Job> {
  const out: Partial<Job> = {};
  if (incoming.description.length > existing.description.length) {
    out.description = incoming.description;
  }
  if (incoming.requirements.length > existing.requirements.length) {
    out.requirements = incoming.requirements;
  }
  if (incoming.responsibilities.length > existing.responsibilities.length) {
    out.responsibilities = incoming.responsibilities;
  }
  if (incoming.technologies.length > existing.technologies.length) {
    out.technologies = incoming.technologies;
  }
  if (!existing.salary.min && incoming.salary.min) out.salary = incoming.salary;
  if (!existing.applyUrl && incoming.applyUrl) out.applyUrl = incoming.applyUrl;
  if (existing.extractionQuality < incoming.extractionQuality) {
    out.extractionQuality = incoming.extractionQuality;
    out.fieldSources = incoming.fieldSources;
  }
  for (const key of ['title', 'company', 'location', 'city', 'country', 'postedAt'] as const) {
    if (!existing[key] && incoming[key]) out[key] = incoming[key];
  }
  for (const key of ['workMode', 'seniority', 'employmentType'] as const) {
    if (existing[key] === 'unknown' && incoming[key] !== 'unknown') {
      out[key] = incoming[key] as never;
    }
  }
  return out;
}

export async function getJob(id: string): Promise<Job | null> {
  const job = await getDb().jobs.get(id);
  return job ? jobSchema.parse(job) : null;
}

export async function getJobByFingerprint(fingerprint: string): Promise<Job | null> {
  const job = await getDb().jobs.where('fingerprint').equals(fingerprint).first();
  return job ? jobSchema.parse(job) : null;
}

export async function getJobByUrl(url: string): Promise<Job | null> {
  const normalized = normalizeUrl(url);
  const all = await getDb().jobs.toArray();
  const found = all.find((job) => normalizeUrl(job.url) === normalized);
  return found ? jobSchema.parse(found) : null;
}

export async function listJobs(
  options: {
    states?: JobState[];
    minScore?: number;
    limit?: number;
    sortBy?: 'score' | 'discoveredAt' | 'updatedAt';
    search?: string;
  } = {},
): Promise<Job[]> {
  const { states, minScore, limit = 500, sortBy = 'discoveredAt', search } = options;
  let jobs = await getDb().jobs.toArray();
  if (states?.length) jobs = jobs.filter((job) => states.includes(job.state));
  if (typeof minScore === 'number') jobs = jobs.filter((job) => (job.score ?? -1) >= minScore);
  if (search) {
    const needle = search.toLowerCase();
    jobs = jobs.filter(
      (job) =>
        job.title.toLowerCase().includes(needle) ||
        job.company.toLowerCase().includes(needle) ||
        job.technologies.some((tech) => tech.toLowerCase().includes(needle)),
    );
  }
  jobs.sort((a, b) => {
    if (sortBy === 'score') return (b.score ?? -1) - (a.score ?? -1);
    if (sortBy === 'updatedAt') return b.updatedAt - a.updatedAt;
    return b.discoveredAt - a.discoveredAt;
  });
  // Сортируем до схлопывания: из пары дублей должна остаться та запись,
  // которую выбрал бы текущий порядок, а не та, что попалась первой в базе.
  return dedupeJobs(jobs).slice(0, limit);
}

export async function updateJob(id: string, patch: Partial<Job>): Promise<Job> {
  const current = await getJob(id);
  if (!current) throw new Error(`Вакансия не найдена: ${id}`);
  if (patch.state && patch.state !== current.state) {
    assertJobTransition(current.state, patch.state);
  }
  const next = jobSchema.parse({ ...current, ...patch, id, updatedAt: Date.now() });
  await getDb().jobs.put(next);
  return next;
}

/** Состояния, из которых сохранение уже не откатывает вакансию назад. */
const PAST_SAVED_STATES: readonly JobState[] = [
  'application_preparing',
  'application_ready',
  'submitted',
];

/**
 * Отмечает вакансию сохранённой. Если по ней уже готовится или отправлена
 * заявка, состояние не трогаем: сохранение — это только пометка, а не шаг назад
 * по жизненному циклу.
 */
export async function markJobSaved(id: string): Promise<Job> {
  const current = await getJob(id);
  if (!current) throw new Error(`Вакансия не найдена: ${id}`);
  const patch: Partial<Job> = { savedAt: current.savedAt ?? Date.now() };
  if (!PAST_SAVED_STATES.includes(current.state)) patch.state = 'saved';
  return updateJob(id, patch);
}

export async function setJobState(id: string, state: JobState): Promise<Job> {
  return updateJob(id, { state });
}

export async function setJobPriority(id: string, priority: JobPriority): Promise<Job> {
  return updateJob(id, { priority });
}

export async function deleteJob(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.jobs, db.analyses, db.applications], async () => {
    await db.jobs.delete(id);
    await db.analyses.where('jobId').equals(id).delete();
    await db.applications.where('jobId').equals(id).delete();
  });
}

export async function countJobs(): Promise<number> {
  return getDb().jobs.count();
}

export async function bulkPutJobs(jobs: Job[]): Promise<void> {
  await getDb().jobs.bulkPut(jobs.map((job) => jobSchema.parse(job)));
}
