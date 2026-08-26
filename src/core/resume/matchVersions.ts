import type { ExtractedJob } from '@/types/job';
import type { UserProfile } from '@/types/profile';
import type { ResumeRecord } from '@/types/resume';
import { analyzeResumeGaps, type ResumeGaps } from './gapAnalysis';

/**
 * Какой из вариантов резюме лучше ложится на конкретную вакансию.
 *
 * Считается тем же разбором пробелов, что и на экране резюме: доля требований
 * вакансии, про которые в тексте варианта действительно написано. Никакого AI —
 * выбор версии должен быть объяснимым, и рядом с процентом всегда видно, каких
 * именно навыков в тексте не хватает.
 */

export interface ResumeVersionMatch {
  id: string;
  name: string;
  /** Доля требований вакансии, отражённых в тексте варианта, 0–100. */
  score: number;
  /** Сколько подтверждённых профилем навыков забыто в этом тексте. */
  missingCount: number;
  gaps: ResumeGaps;
}

export function rankResumeVersions(
  job: ExtractedJob,
  profile: UserProfile,
  versions: ResumeRecord[],
): ResumeVersionMatch[] {
  return versions
    .map((version) => {
      const gaps = analyzeResumeGaps(job, profile, version.text);
      return {
        id: version.id,
        name: version.name,
        score: Math.round(gaps.resumeCoverage * 100),
        missingCount: gaps.missingFromResume.length,
        gaps,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'));
}
