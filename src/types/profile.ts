import { z } from 'zod';

/**
 * The user profile is the single source of truth for every AI feature.
 * It is deliberately structured (never free text) so the scoring engine can
 * work deterministically and the AI can be constrained to real facts.
 */

export const SKILL_CATEGORIES = ['frontend', 'backend', 'devops', 'database', 'other'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'freelance',
  'internship',
  'temporary',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODES = ['remote', 'hybrid', 'office'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const SENIORITY_LEVELS = [
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
  'principal',
  'director',
] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const LANGUAGE_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'native'] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const skillSchema = z.object({
  name: z.string().min(1).max(60),
  category: z.enum(SKILL_CATEGORIES),
  /** Self-reported years of hands-on use. Optional — never invented by AI. */
  years: z.number().min(0).max(50).optional(),
  /** Marks a skill the user considers core to their offer. */
  primary: z.boolean().default(false),
});
export type Skill = z.infer<typeof skillSchema>;

export const languageSchema = z.object({
  code: z.string().min(2).max(8),
  name: z.string().min(1).max(40),
  level: z.enum(LANGUAGE_LEVELS),
});
export type LanguageSkill = z.infer<typeof languageSchema>;

export const salarySchema = z.object({
  currency: z.string().min(1).max(8).default('USD'),
  period: z.enum(['hour', 'day', 'month', 'year']).default('month'),
  current: z.number().min(0).optional(),
  expected: z.number().min(0).optional(),
  minimumAcceptable: z.number().min(0).optional(),
});
export type SalaryPreference = z.infer<typeof salarySchema>;

export const locationSchema = z.object({
  country: z.string().max(80).default(''),
  city: z.string().max(80).default(''),
  timezone: z.string().max(60).default(''),
  willingToRelocate: z.boolean().default(false),
  relocationCountries: z.array(z.string().max(80)).default([]),
});
export type ProfileLocation = z.infer<typeof locationSchema>;

export const linksSchema = z.object({
  linkedin: z.string().max(300).default(''),
  github: z.string().max(300).default(''),
  portfolio: z.string().max(300).default(''),
  other: z.array(z.object({ label: z.string().max(60), url: z.string().max(300) })).default([]),
});
export type ProfileLinks = z.infer<typeof linksSchema>;

export const preferencesSchema = z.object({
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).default(['full_time']),
  workModes: z.array(z.enum(WORK_MODES)).default(['remote']),
  /** Free-form dealbreakers shown to the AI as constraints, e.g. "no on-call". */
  dealbreakers: z.array(z.string().max(160)).default([]),
  industries: z.array(z.string().max(60)).default([]),
  companySizes: z.array(z.string().max(40)).default([]),
  noticePeriodWeeks: z.number().min(0).max(52).optional(),
  availableFrom: z.string().max(40).optional(),
  requiresVisaSponsorship: z.boolean().default(false),
  workAuthorization: z.array(z.string().max(80)).default([]),
});
export type ProfilePreferences = z.infer<typeof preferencesSchema>;

export const experienceEntrySchema = z.object({
  id: z.string(),
  company: z.string().max(120),
  position: z.string().max(120),
  startDate: z.string().max(20).default(''),
  endDate: z.string().max(20).default(''),
  current: z.boolean().default(false),
  description: z.string().max(4000).default(''),
  technologies: z.array(z.string().max(60)).default([]),
});
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;

export const educationEntrySchema = z.object({
  id: z.string(),
  institution: z.string().max(160),
  degree: z.string().max(120).default(''),
  field: z.string().max(120).default(''),
  startDate: z.string().max(20).default(''),
  endDate: z.string().max(20).default(''),
});
export type EducationEntry = z.infer<typeof educationEntrySchema>;

export const attachmentSchema = z.object({
  id: z.string(),
  kind: z.enum(['resume', 'cover_letter', 'portfolio', 'certificate', 'other']),
  name: z.string().max(200),
  mimeType: z.string().max(120),
  size: z.number().min(0),
  /** Stored locally as a data URL — never uploaded anywhere by the extension. */
  dataUrl: z.string(),
  isDefault: z.boolean().default(false),
  createdAt: z.number(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const personalSchema = z.object({
  firstName: z.string().max(80).default(''),
  lastName: z.string().max(80).default(''),
  email: z.string().max(160).default(''),
  phone: z.string().max(40).default(''),
});
export type PersonalInfo = z.infer<typeof personalSchema>;

export const professionalSchema = z.object({
  currentPosition: z.string().max(120).default(''),
  desiredPosition: z.string().max(120).default(''),
  seniority: z.enum(SENIORITY_LEVELS).default('mid'),
  experienceYears: z.number().min(0).max(60).default(0),
  summary: z.string().max(2000).default(''),
});
export type ProfessionalInfo = z.infer<typeof professionalSchema>;

export const userProfileSchema = z.object({
  id: z.literal('primary').default('primary'),
  /** Bumped on every meaningful edit; cached analyses are keyed on it. */
  version: z.number().int().min(1).default(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  onboardingCompleted: z.boolean().default(false),
  personal: personalSchema.default({}),
  professional: professionalSchema.default({}),
  location: locationSchema.default({}),
  links: linksSchema.default({}),
  salary: salarySchema.default({}),
  preferences: preferencesSchema.default({}),
  skills: z.array(skillSchema).default([]),
  languages: z.array(languageSchema).default([]),
  experience: z.array(experienceEntrySchema).default([]),
  education: z.array(educationEntrySchema).default([]),
  attachments: z.array(attachmentSchema).default([]),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * Compact, PII-free projection of the profile that is sent to AI providers.
 * Personal contact details are never part of an analysis request.
 */
export const aiProfileSchema = z.object({
  role: z.string(),
  desiredRole: z.string(),
  seniority: z.enum(SENIORITY_LEVELS),
  experienceYears: z.number(),
  summary: z.string(),
  skills: z.record(z.enum(SKILL_CATEGORIES), z.array(z.string())),
  primarySkills: z.array(z.string()),
  languages: z.array(z.object({ name: z.string(), level: z.enum(LANGUAGE_LEVELS) })),
  location: z.object({
    country: z.string(),
    city: z.string(),
    willingToRelocate: z.boolean(),
    relocationCountries: z.array(z.string()),
  }),
  salary: z.object({
    currency: z.string(),
    period: z.enum(['hour', 'day', 'month', 'year']),
    expected: z.number().optional(),
    minimumAcceptable: z.number().optional(),
  }),
  preferences: z.object({
    employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)),
    workModes: z.array(z.enum(WORK_MODES)),
    dealbreakers: z.array(z.string()),
    requiresVisaSponsorship: z.boolean(),
    workAuthorization: z.array(z.string()),
  }),
  experience: z.array(
    z.object({
      company: z.string(),
      position: z.string(),
      period: z.string(),
      technologies: z.array(z.string()),
      description: z.string(),
    }),
  ),
  education: z.array(z.object({ institution: z.string(), degree: z.string(), field: z.string() })),
});
export type AIProfile = z.infer<typeof aiProfileSchema>;
