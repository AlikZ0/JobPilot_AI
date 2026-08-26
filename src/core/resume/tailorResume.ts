import type { ExtractedJob } from '@/types/job';
import type { UserProfile } from '@/types/profile';
import type { Settings } from '@/types/settings';
import { tailoredResumeSchema, type TailoredResume } from '@/types/resume';
import { runAITask } from '@/core/ai/aiService';
import { buildAIProfile } from '@/core/ai/profileProjection';
import { canonicalizeTech, expandImplied } from '@/core/extraction/techDictionary';
import { normalizeToken, unique } from '@/utils/text';
import { analyzeResumeGaps, suggestedKeywords, type ResumeGaps } from './gapAnalysis';
import { mentions } from './atsAudit';

export interface TailorInput {
  job: ExtractedJob;
  profile: UserProfile;
  settings: Settings;
  resumeText: string;
}

export interface TailorOutcome {
  resume: TailoredResume;
  gaps: ResumeGaps;
  /** Навыки, которые модель попыталась приписать вопреки фактам. */
  rejectedSkills: string[];
}

/**
 * Выбрасывает из результата модели всё, чего пользователь не может подтвердить.
 * Это последний рубеж: промпт просит не выдумывать, а этот фильтр гарантирует.
 */
export function enforceTruthfulness(
  resume: TailoredResume,
  profile: UserProfile,
  resumeText: string,
): { resume: TailoredResume; rejected: string[] } {
  const owned = new Set<string>();
  for (const skill of profile.skills) {
    for (const implied of expandImplied(skill.name)) owned.add(normalizeToken(implied));
  }
  for (const entry of profile.experience) {
    for (const tech of entry.technologies) {
      for (const implied of expandImplied(tech)) owned.add(normalizeToken(implied));
    }
  }

  const isAllowed = (raw: string) => {
    const skill = canonicalizeTech(raw);
    return owned.has(normalizeToken(skill)) || mentions(resumeText, skill);
  };

  const rejected: string[] = [];
  const skills = resume.skills.filter((skill) => {
    if (isAllowed(skill)) return true;
    rejected.push(skill);
    return false;
  });

  const addedFromProfile = resume.addedFromProfile.filter(isAllowed);
  const knownCompanies = new Set(
    [...profile.experience.map((entry) => entry.company)].map(normalizeToken).filter(Boolean),
  );
  // Компанию, которой нет ни в профиле, ни в исходном резюме, модель выдумала.
  const experience = resume.experience.filter((entry) => {
    const known =
      knownCompanies.has(normalizeToken(entry.company)) || mentions(resumeText, entry.company);
    if (!known) rejected.push(entry.company);
    return known;
  });

  return {
    resume: {
      ...resume,
      skills,
      experience,
      addedFromProfile,
      notAdded: unique([...resume.notAdded, ...rejected]),
      status: rejected.length > 0 ? 'needs_user_confirmation' : resume.status,
    },
    rejected: unique(rejected),
  };
}

/**
 * Подгонка резюме под вакансию: сначала детерминированный анализ пробелов,
 * затем переписывание моделью и фильтр правдивости поверх её ответа.
 */
export async function tailorResume(input: TailorInput): Promise<TailorOutcome> {
  const { job, profile, settings, resumeText } = input;
  const gaps = analyzeResumeGaps(job, profile, resumeText);

  const result = await runAITask(
    'resume_tailoring',
    (resolved) =>
      resolved.provider.tailorResume(
        {
          profile: buildAIProfile(profile, {
            includeExperience: settings.privacy.shareExperienceWithAI,
          }),
          job,
          resumeText,
          missingFromResume: suggestedKeywords(gaps),
          notOwned: gaps.notOwned.map((gap) => gap.skill),
          language: settings.generationLanguage,
        },
        resolved.ctx,
      ),
    { settings },
  );

  const checked = enforceTruthfulness(result.data, profile, resumeText);
  return { resume: checked.resume, gaps, rejectedSkills: checked.rejected };
}

/**
 * Резюме под вакансию без AI: берём исходный текст и дописываем в раздел
 * «Навыки» то, что подтверждено профилем. Работает всегда, даже без ключа.
 */
export function tailorWithoutAI(
  job: ExtractedJob,
  profile: UserProfile,
  resumeText: string,
): TailorOutcome {
  const gaps = analyzeResumeGaps(job, profile, resumeText);
  const resume = tailoredResumeSchema.parse({
    headline: job.title || profile.professional.desiredPosition,
    summary: profile.professional.summary,
    skills: unique([
      ...profile.skills.map((skill) =>
        skill.version
          ? `${canonicalizeTech(skill.name)} ${skill.version}`
          : canonicalizeTech(skill.name),
      ),
      ...suggestedKeywords(gaps),
    ]),
    experience: profile.experience.map((entry) => ({
      company: entry.company,
      position: entry.position,
      period: `${entry.startDate}${entry.current ? ' — настоящее время' : entry.endDate ? ` — ${entry.endDate}` : ''}`,
      bullets: entry.description
        .split(/\n+/)
        .map((line) => line.replace(/^[-•*\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 8),
    })),
    education: profile.education.map((entry) => ({
      institution: entry.institution,
      degree: [entry.degree, entry.field].filter(Boolean).join(', '),
    })),
    languages: profile.languages.map(
      (language) => `${language.name} (${language.level.toUpperCase()})`,
    ),
    addedFromProfile: suggestedKeywords(gaps),
    notAdded: gaps.notOwned.map((gap) => gap.skill),
    atsNotes: [],
    status: 'ok',
  });
  return { resume, gaps, rejectedSkills: [] };
}
