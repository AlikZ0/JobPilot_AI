import type { JobAnalysis } from '@/types/ai';
import type { UserProfile } from '@/types/profile';
import type { Settings } from '@/types/settings';
import {
  listAnalyses,
  saveAnalysis,
  ANALYSIS_VERSION,
} from '@/database/repositories/analysisRepository';
import { listJobs, updateJob } from '@/database/repositories/jobRepository';
import { createId } from '@/utils/id';
import { computePriority, scoreJob } from './engine';
import { labelForBand, normalizeWeights, weightsKey } from './weights';

export interface RescoreOutcome {
  /** Сколько вакансий вообще имели анализ. */
  total: number;
  /** У скольких балл пересчитан. */
  rescored: number;
  /** У скольких балл изменился. */
  changed: number;
  /** Сколько уже были посчитаны текущими весами. */
  upToDate: number;
  /** Сколько пересчитаны без выводов AI, потому что они не сохранялись. */
  withoutFindings: number;
}

/**
 * Пересчитывает баллы сохранённых вакансий под текущие веса.
 *
 * Сам по себе сдвиг ползунков лишь обесценивает кеш: новый балл получила бы
 * только та вакансия, которую откроют заново. Список при этом остался бы
 * отсортированным по старым приоритетам — молча и незаметно. Поэтому пересчёт
 * есть, но он явный.
 *
 * К провайдеру пересчёт не обращается: качественная часть берётся из сохранённых
 * выводов AI. Если их не сохраняли (Приватность → «Хранить обоснования AI»),
 * вакансия пересчитывается детерминированно, и это видно в отчёте.
 */
export async function rescoreStoredJobs(
  profile: UserProfile,
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<RescoreOutcome> {
  const weights = normalizeWeights(settings.scoring.weights);
  const currentKey = weightsKey(weights);

  const jobs = await listJobs({ limit: 10_000 });
  const latest = new Map<string, JobAnalysis>();
  for (const analysis of await listAnalyses(20_000)) {
    const known = latest.get(analysis.jobId);
    if (!known || known.createdAt < analysis.createdAt) latest.set(analysis.jobId, analysis);
  }

  const outcome: RescoreOutcome = {
    total: 0,
    rescored: 0,
    changed: 0,
    upToDate: 0,
    withoutFindings: 0,
  };

  const pending = jobs.filter((job) => latest.has(job.id));
  outcome.total = pending.length;

  let done = 0;
  for (const job of pending) {
    const previous = latest.get(job.id) as JobAnalysis;
    done += 1;
    onProgress?.(done, outcome.total);

    if (previous.weightsKey === currentKey && previous.profileVersion === profile.version) {
      outcome.upToDate += 1;
      continue;
    }

    const scored = scoreJob({ job, profile, findings: previous.findings, weights });
    if (previous.usedAI && !previous.findings) outcome.withoutFindings += 1;

    const analysis: JobAnalysis = {
      ...previous,
      id: createId('ana'),
      profileVersion: profile.version,
      analysisVersion: ANALYSIS_VERSION,
      weightsKey: scored.weightsKey,
      createdAt: Date.now(),
      score: scored.score,
      band: scored.band,
      breakdown: scored.breakdown,
      matchedSkills: scored.matchedSkills,
      versionMismatches: scored.versionMismatches,
      missingSkills: scored.missingSkills,
      bonusSkills: scored.bonusSkills,
      seniorityMatch: scored.seniorityMatch,
      salaryMatch: scored.salaryMatch,
      locationMatch: scored.locationMatch,
      languageMatch: scored.languageMatch,
      experienceMatch: scored.experienceMatch,
      redFlags: scored.redFlags,
      // Обоснование модели относилось к прежнему раскладу весов; итоговую строку
      // пересобираем, чтобы она не спорила с новым числом.
      summary: previous.usedAI
        ? previous.summary
        : `${labelForBand(scored.band)} — ${scored.score}%.`,
      // Балл пересчитан правилами, а не новым обращением к модели.
      usedAI: previous.usedAI && Boolean(previous.findings),
    };

    await saveAnalysis(analysis);
    if (scored.score !== previous.score) outcome.changed += 1;
    outcome.rescored += 1;

    await updateJob(job.id, {
      score: scored.score,
      analyzedAt: analysis.createdAt,
      priority: computePriority({ ...job, score: scored.score }, profile),
    });
  }

  return outcome;
}
