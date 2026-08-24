import { getDb } from '../db';
import { jobAnalysisSchema, type JobAnalysis } from '@/types/ai';

/** Bump when the scoring engine changes so old analyses are recomputed. */
export const ANALYSIS_VERSION = 1;

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
 * Cache lookup: an analysis is reusable only when it was produced for the same
 * posting content, the same profile version and the same scoring version.
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
