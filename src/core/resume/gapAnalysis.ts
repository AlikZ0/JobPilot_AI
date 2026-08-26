import type { ExtractedJob } from '@/types/job';
import type { UserProfile } from '@/types/profile';
import { canonicalizeTech, expandImplied } from '@/core/extraction/techDictionary';
import { classifyJobSkills, profileSkillVersions } from '@/core/scoring/skillMatcher';
import { normalizeToken, unique } from '@/utils/text';
import { mentions } from './atsAudit';

/**
 * Сравнение трёх источников: чего хочет вакансия, что есть в профиле и что
 * написано в резюме. Именно отсюда берётся главный сценарий: «этот навык у вас
 * есть, но в резюме про него ни слова».
 *
 * Всё считается правилами, без AI: список того, что можно дописать в резюме,
 * должен быть проверяемым, а не сгенерированным.
 */

export interface SkillGap {
  skill: string;
  /** Отмечена ли технология в вакансии как обязательная. */
  mandatory: boolean;
  /** Версия, которую просит вакансия, если она указана. */
  requiredVersion: string;
  /** Версии из профиля. */
  profileVersions: string[];
}

export interface ResumeGaps {
  /** Требуется вакансией, есть в профиле и упомянуто в резюме. */
  covered: SkillGap[];
  /**
   * Требуется вакансией, есть в профиле, но в резюме не упомянуто.
   * Это можно и нужно дописать: факт подтверждён профилем.
   */
  missingFromResume: SkillGap[];
  /**
   * Требуется вакансией, но нет ни в профиле, ни в резюме.
   * Дописывать нельзя — это будет неправдой.
   */
  notOwned: SkillGap[];
  /** Доля требований вакансии, отражённых в резюме. */
  resumeCoverage: number;
  /** Доля требований вакансии, которые пользователь реально закрывает. */
  profileCoverage: number;
}

function profileOwns(profile: UserProfile, skill: string): boolean {
  const owned = new Set<string>();
  for (const entry of profile.skills) {
    for (const implied of expandImplied(entry.name)) owned.add(normalizeToken(implied));
  }
  for (const entry of profile.experience) {
    for (const tech of entry.technologies) {
      for (const implied of expandImplied(tech)) owned.add(normalizeToken(implied));
    }
  }
  return owned.has(normalizeToken(skill));
}

/**
 * Сопоставляет требования вакансии с профилем и текстом резюме.
 * Навык считается упомянутым в резюме, если встречается он сам или технология,
 * которая его подразумевает (Nuxt подразумевает Vue).
 */
export function analyzeResumeGaps(
  job: ExtractedJob,
  profile: UserProfile,
  resumeText: string,
): ResumeGaps {
  const { mandatory, optional } = classifyJobSkills(job);
  const required = unique([...mandatory, ...optional].map(canonicalizeTech));
  const versions = profileSkillVersions(profile);
  const jobText = [job.title, ...job.requirements, ...job.responsibilities, job.description].join(
    '\n',
  );

  const covered: SkillGap[] = [];
  const missingFromResume: SkillGap[] = [];
  const notOwned: SkillGap[] = [];

  for (const skill of required) {
    const profileVersions = [...(versions.get(normalizeToken(skill)) ?? new Set<string>())]
      .filter(Boolean)
      .sort();
    const gap: SkillGap = {
      skill,
      mandatory: mandatory.map(canonicalizeTech).includes(skill),
      requiredVersion: requiredVersionOf(jobText, skill),
      profileVersions,
    };

    const inResume = mentionedInResume(resumeText, skill);
    const owned = profileOwns(profile, skill);

    if (inResume && owned) covered.push(gap);
    else if (owned) missingFromResume.push(gap);
    else if (inResume)
      covered.push(gap); // написано в резюме — верим резюме
    else notOwned.push(gap);
  }

  const total = required.length;
  return {
    covered,
    missingFromResume,
    notOwned,
    resumeCoverage: total === 0 ? 1 : covered.length / total,
    profileCoverage: total === 0 ? 1 : (covered.length + missingFromResume.length) / total,
  };
}

/** Навык считается упомянутым, если он сам или его «потомок» есть в тексте. */
function mentionedInResume(resumeText: string, skill: string): boolean {
  if (mentions(resumeText, skill)) return true;
  // Nuxt в резюме означает и Vue, и JavaScript.
  const impliedBy = ['Nuxt', 'Next.js', 'NestJS', 'React Native', 'Ruby on Rails', 'Spring'];
  return impliedBy.some(
    (parent) =>
      mentions(resumeText, parent) &&
      expandImplied(parent).some((implied) => normalizeToken(implied) === normalizeToken(skill)),
  );
}

function requiredVersionOf(jobText: string, skill: string): string {
  const escaped = normalizeToken(skill).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = normalizeToken(jobText).match(new RegExp(`${escaped}\\s*v?(\\d{1,2})`));
  return match?.[1] ?? '';
}

/**
 * Ключевые слова вакансии, которых нет в резюме, но которые есть в профиле —
 * в виде готовых строк для раздела «Навыки».
 */
export function suggestedKeywords(gaps: ResumeGaps): string[] {
  return gaps.missingFromResume.map((gap) =>
    gap.requiredVersion && gap.profileVersions.includes(gap.requiredVersion)
      ? `${gap.skill} ${gap.requiredVersion}`
      : gap.profileVersions[0]
        ? `${gap.skill} ${gap.profileVersions[0]}`
        : gap.skill,
  );
}
