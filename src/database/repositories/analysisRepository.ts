import { getDb } from '../db';
import { jobAnalysisSchema, type JobAnalysis } from '@/types/ai';

/** Увеличивайте при изменении движка скоринга, чтобы старые анализы пересчитались. */
export const ANALYSIS_VERSION = 2;

export async function saveAnalysis(analysis: JobAnalysis): Promise<JobAnalysis> {
  const parsed = jobAnalysisSchema.parse(analysis);
  await getDb().analyses.put(parsed);
  return parsed;
}

export async function getLatestAnalysis(jobId: string): Promise<JobAnalysis | null> {
  const rows = await getDb().analyses.where('jobId').equals(jobId).toArray();
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return jobAnalysisSchema.parse(rows[0]);
}

/**
 * Поиск в кеше: анализ можно переиспользовать, только если он сделан для того же
 * содержимого вакансии, той же версии профиля и той же версии скоринга.
 */
export async function findCachedAnalysis(
  fingerprint: string,
  profileVersion: number,
): Promise<JobAnalysis | null> {
  const rows = await getDb().analyses.where('jobFingerprint').equals(fingerprint).toArray();
  const usable = rows
    .filter(
      (row) => row.profileVersion === profileVersion && row.analysisVersion === ANALYSIS_VERSION,
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  return usable[0] ? jobAnalysisSchema.parse(usable[0]) : null;
}

export async function listAnalyses(limit = 500): Promise<JobAnalysis[]> {
  const rows = await getDb().analyses.toArray();
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows.slice(0, limit).map((row) => jobAnalysisSchema.parse(row));
}

export async function deleteAnalysesForJob(jobId: string): Promise<void> {
  await getDb().analyses.where('jobId').equals(jobId).delete();
}

export async function bulkPutAnalyses(analyses: JobAnalysis[]): Promise<void> {
  await getDb().analyses.bulkPut(analyses.map((a) => jobAnalysisSchema.parse(a)));
}
