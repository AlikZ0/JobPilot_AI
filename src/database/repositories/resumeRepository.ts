import { getDb } from '../db';
import type { ResumeRecord, TailoredResume } from '@/types/resume';
import { createId } from '@/utils/id';

/**
 * Хранилище резюме: одно исходное (jobId = null) и по одному подогнанному на
 * каждую вакансию. Всё лежит локально, как и остальные данные.
 */

export const BASE_RESUME_ID = 'resume_base';

export async function saveBaseResume(input: {
  text: string;
  fileName: string;
  source: ResumeRecord['source'];
  pages: number;
  charsPerPage: number;
}): Promise<ResumeRecord> {
  const now = Date.now();
  const existing = await getDb().resumes.get(BASE_RESUME_ID);
  const record: ResumeRecord = {
    id: BASE_RESUME_ID,
    text: input.text,
    fileName: input.fileName,
    source: input.source,
    pages: input.pages,
    charsPerPage: input.charsPerPage,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    jobId: null,
    tailored: null,
    userEdited: false,
  };
  await getDb().resumes.put(record);
  return record;
}

export async function getBaseResume(): Promise<ResumeRecord | null> {
  return (await getDb().resumes.get(BASE_RESUME_ID)) ?? null;
}

export async function saveTailoredResume(
  jobId: string,
  tailored: TailoredResume,
  options: { userEdited?: boolean } = {},
): Promise<ResumeRecord> {
  const base = await getBaseResume();
  const existing = (await getDb().resumes.where('jobId').equals(jobId).first()) ?? null;
  const now = Date.now();
  const record: ResumeRecord = {
    id: existing?.id ?? createId('resume'),
    text: base?.text ?? '',
    fileName: base?.fileName ?? '',
    source: base?.source ?? 'text',
    pages: base?.pages ?? 0,
    charsPerPage: base?.charsPerPage ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    jobId,
    tailored,
    userEdited: options.userEdited ?? existing?.userEdited ?? false,
  };
  await getDb().resumes.put(record);
  return record;
}

export async function getTailoredResume(jobId: string): Promise<ResumeRecord | null> {
  return (await getDb().resumes.where('jobId').equals(jobId).first()) ?? null;
}

export async function listTailoredResumes(): Promise<ResumeRecord[]> {
  const rows = await getDb().resumes.toArray();
  return rows.filter((row) => row.jobId !== null).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteResume(id: string): Promise<void> {
  await getDb().resumes.delete(id);
}
