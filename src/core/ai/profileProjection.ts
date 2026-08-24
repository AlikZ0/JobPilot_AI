import type { AIProfile, SkillCategory, UserProfile } from '@/types/profile';
import { aiProfileSchema } from '@/types/profile';
import { canonicalizeTech } from '@/core/extraction/techDictionary';
import { truncate } from '@/utils/text';

/**
 * Builds the PII-free profile projection sent to AI providers. Name, email,
 * phone, links and attachments are deliberately excluded — a job analysis never
 * needs them (docs/privacy.md).
 */
export function buildAIProfile(
  profile: UserProfile,
  options: { includeExperience?: boolean } = {},
): AIProfile {
  const includeExperience = options.includeExperience ?? true;
  const skills: Record<SkillCategory, string[]> = {
    frontend: [],
    backend: [],
    devops: [],
    database: [],
    other: [],
  };
  for (const skill of profile.skills) {
    skills[skill.category].push(canonicalizeTech(skill.name));
  }

  return aiProfileSchema.parse({
    role: profile.professional.currentPosition,
    desiredRole: profile.professional.desiredPosition,
    seniority: profile.professional.seniority,
    experienceYears: profile.professional.experienceYears,
    summary: truncate(profile.professional.summary, 1200),
    skills,
    primarySkills: profile.skills.filter((s) => s.primary).map((s) => canonicalizeTech(s.name)),
    languages: profile.languages.map((language) => ({
      name: language.name,
      level: language.level,
    })),
    location: {
      country: profile.location.country,
      city: profile.location.city,
      willingToRelocate: profile.location.willingToRelocate,
      relocationCountries: profile.location.relocationCountries,
    },
    salary: {
      currency: profile.salary.currency,
      period: profile.salary.period,
      ...(profile.salary.expected !== undefined ? { expected: profile.salary.expected } : {}),
      ...(profile.salary.minimumAcceptable !== undefined
        ? { minimumAcceptable: profile.salary.minimumAcceptable }
        : {}),
    },
    preferences: {
      employmentTypes: profile.preferences.employmentTypes,
      workModes: profile.preferences.workModes,
      dealbreakers: profile.preferences.dealbreakers,
      requiresVisaSponsorship: profile.preferences.requiresVisaSponsorship,
      workAuthorization: profile.preferences.workAuthorization,
    },
    experience: includeExperience
      ? profile.experience.slice(0, 8).map((entry) => ({
          company: entry.company,
          position: entry.position,
          period: `${entry.startDate}${entry.current ? ' – present' : entry.endDate ? ` – ${entry.endDate}` : ''}`,
          technologies: entry.technologies.map(canonicalizeTech),
          description: truncate(entry.description, 600),
        }))
      : [],
    education: includeExperience
      ? profile.education.slice(0, 5).map((entry) => ({
          institution: entry.institution,
          degree: entry.degree,
          field: entry.field,
        }))
      : [],
  });
}
