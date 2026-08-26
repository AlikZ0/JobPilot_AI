import { getDb } from '../db';
import type { ResumeRecord, TailoredResume } from '@/types/resume';
import { createId } from '@/utils/id';

/**
 * Хранилище резюме: несколько вариантов под разные роли и по одной подогнанной
 * копии на каждую вакансию. Всё лежит локально, как и остальные данные.
 *
 * Вариант — это запись с `jobId: null`; подогнанная копия ссылается на вакансию
 * и на вариант, из которого собрана.
 */

/** Идентификатор первого варианта. Остался прежним, чтобы старые базы открылись. */
export const BASE_RESUME_ID = 'resume_base';

const DEFAULT_NAME = 'Основное';

/**
 * Записи, созданные до появления вариантов, не знают о `name`, `baseId` и
 * `primary`. Дополняем их при чтении, а не миграцией: так база остаётся
 * читаемой и предыдущей версией расширения.
 */
function normalize(row: ResumeRecord): ResumeRecord {
  return {
    ...row,
    name: row.name ?? (row.jobId === null ? DEFAULT_NAME : ''),
    baseId: row.baseId ?? null,
    primary: row.primary ?? row.id === BASE_RESUME_ID,
  };
}

function byName(a: ResumeRecord, b: ResumeRecord): number {
  if (a.primary !== b.primary) return a.primary ? -1 : 1;
  return a.name.localeCompare(b.name, 'ru');
}

/** Все варианты резюме: основной первым, остальные по алфавиту. */
export async function listResumeVersions(): Promise<ResumeRecord[]> {
  const rows = await getDb().resumes.toArray();
  return rows
    .filter((row) => row.jobId === null)
    .map(normalize)
    .sort(byName);
}

export async function getResumeVersion(id: string): Promise<ResumeRecord | null> {
  const row = await getDb().resumes.get(id);
  return row && row.jobId === null ? normalize(row) : null;
}

/**
 * Вариант по умолчанию. Если отметки нет ни у кого — берём самый свежий:
 * пустой экран хуже, чем разумная догадка.
 */
export async function getPrimaryResume(): Promise<ResumeRecord | null> {
  const versions = await listResumeVersions();
  if (versions.length === 0) return null;
  return (
    versions.find((row) => row.primary) ??
    [...versions].sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
    null
  );
}

export interface ResumeVersionInput {
  name: string;
  text: string;
  fileName?: string;
  source?: ResumeRecord['source'];
  pages?: number;
  charsPerPage?: number;
}

export async function createResumeVersion(input: ResumeVersionInput): Promise<ResumeRecord> {
  const now = Date.now();
  const existing = await listResumeVersions();
  const record: ResumeRecord = {
    // Первый вариант занимает исторический идентификатор: у тех, кто уже
    // пользовался расширением, он и так есть, а новая база получит тот же.
    id: existing.length === 0 ? BASE_RESUME_ID : createId('resume'),
    name: input.name.trim() || DEFAULT_NAME,
    text: input.text,
    fileName: input.fileName ?? '',
    source: input.source ?? 'text',
    pages: input.pages ?? 0,
    charsPerPage: input.charsPerPage ?? 0,
    createdAt: now,
    updatedAt: now,
    jobId: null,
    baseId: null,
    primary: existing.length === 0,
    tailored: null,
    userEdited: false,
  };
  await getDb().resumes.put(record);
  return record;
}

export async function updateResumeVersion(
  id: string,
  patch: Partial<Omit<ResumeRecord, 'id' | 'jobId' | 'baseId' | 'createdAt'>>,
): Promise<ResumeRecord> {
  const current = await getResumeVersion(id);
  if (!current) throw new Error(`Вариант резюме не найден: ${id}`);
  const record: ResumeRecord = { ...current, ...patch, id, updatedAt: Date.now() };
  await getDb().resumes.put(record);
  return record;
}

/** Отметка «основной» ровно одна, поэтому снимаем её со всех остальных. */
export async function setPrimaryResume(id: string): Promise<void> {
  const versions = await listResumeVersions();
  await getDb().resumes.bulkPut(versions.map((row) => ({ ...row, primary: row.id === id })));
}

/**
 * Удаляет вариант вместе с подогнанными из него копиями: без исходника они
 * всё равно ни на что не ссылаются. Отметка «основной» переходит к самому
 * свежему из оставшихся.
 */
export async function deleteResumeVersion(id: string): Promise<void> {
  const db = getDb();
  const rows = (await db.resumes.toArray()).map(normalize);
  const removing = rows.filter((row) => row.id === id || row.baseId === id);
  await db.resumes.bulkDelete(removing.map((row) => row.id));

  const wasPrimary = rows.find((row) => row.id === id)?.primary ?? false;
  if (!wasPrimary) return;
  const rest = rows
    .filter((row) => row.jobId === null && row.id !== id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const next = rest[0];
  if (next) await db.resumes.put({ ...next, primary: true });
}

export async function saveTailoredResume(
  jobId: string,
  tailored: TailoredResume,
  options: { baseId?: string | null; userEdited?: boolean } = {},
): Promise<ResumeRecord> {
  const baseId = options.baseId ?? null;
  const base = baseId ? await getResumeVersion(baseId) : await getPrimaryResume();
  const existing = (await getDb().resumes.where('jobId').equals(jobId).first()) ?? null;
  const now = Date.now();
  const record: ResumeRecord = {
    id: existing?.id ?? createId('resume'),
    name: '',
    text: base?.text ?? '',
    fileName: base?.fileName ?? '',
    source: base?.source ?? 'text',
    pages: base?.pages ?? 0,
    charsPerPage: base?.charsPerPage ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    jobId,
    baseId: base?.id ?? null,
    primary: false,
    tailored,
    userEdited: options.userEdited ?? existing?.userEdited ?? false,
  };
  await getDb().resumes.put(record);
  return record;
}

export async function getTailoredResume(jobId: string): Promise<ResumeRecord | null> {
  const row = await getDb().resumes.where('jobId').equals(jobId).first();
  return row ? normalize(row) : null;
}

export async function listTailoredResumes(): Promise<ResumeRecord[]> {
  const rows = await getDb().resumes.toArray();
  return rows
    .filter((row) => row.jobId !== null)
    .map(normalize)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteResume(id: string): Promise<void> {
  await getDb().resumes.delete(id);
}
