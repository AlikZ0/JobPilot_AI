import { z } from 'zod';
import { SENIORITY_LEVELS } from './profile';

export const AI_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'custom',
  'cloud',
] as const;
export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export const AI_TASKS = [
  'job_analysis',
  'cover_letter',
  'form_analysis',
  'application_answer',
  'assistant',
  'job_extraction',
  'resume_analysis',
] as const;
export type AITask = (typeof AI_TASKS)[number];

export const RECOMMENDATION_BANDS = [
  'not_suitable',
  'weak_match',
  'potential_match',
  'good_match',
  'strong_match',
] as const;
export type RecommendationBand = (typeof RECOMMENDATION_BANDS)[number];

export const RED_FLAG_CODES = [
  'unrealistic_requirements',
  'very_broad_responsibilities',
  'suspicious_salary',
  'unpaid_position',
  'commission_only',
  'relocation_required',
  'language_mismatch',
  'visa_restriction',
  'mandatory_tech_missing',
  'vague_description',
  'other',
] as const;
export type RedFlagCode = (typeof RED_FLAG_CODES)[number];

export const redFlagSchema = z.object({
  code: z.enum(RED_FLAG_CODES),
  severity: z.enum(['low', 'medium', 'high']),
  detail: z.string().max(400),
});
export type RedFlag = z.infer<typeof redFlagSchema>;

/**
 * Что модели разрешено возвращать при анализе вакансии: только качественные
 * выводы. Числовой балл считает детерминированный движок скоринга, чтобы модель
 * не могла просто выдумать процент.
 */
export const aiJobFindingsSchema = z.object({
  matchedSkills: z.array(z.string().max(60)).max(80).default([]),
  missingSkills: z.array(z.string().max(60)).max(80).default([]),
  bonusSkills: z.array(z.string().max(60)).max(80).default([]),
  mandatorySkills: z.array(z.string().max(60)).max(80).default([]),
  detectedSeniority: z.enum([...SENIORITY_LEVELS, 'unknown']).default('unknown'),
  requiredExperienceYears: z.number().min(0).max(60).nullable().default(null),
  languageRequirements: z
    .array(z.object({ language: z.string().max(40), level: z.string().max(20).default('') }))
    .max(10)
    .default([]),
  responsibilitiesAlignment: z.number().min(0).max(1).default(0.5),
  cultureNotes: z.string().max(600).default(''),
  redFlags: z.array(redFlagSchema).max(15).default([]),
  reasoning: z.string().max(2000).default(''),
  summary: z.string().max(600).default(''),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type AIJobFindings = z.infer<typeof aiJobFindingsSchema>;

export const scoreBreakdownSchema = z.object({
  technicalSkills: z.object({ earned: z.number(), max: z.literal(40), detail: z.string() }),
  experience: z.object({ earned: z.number(), max: z.literal(15), detail: z.string() }),
  seniority: z.object({ earned: z.number(), max: z.literal(10), detail: z.string() }),
  location: z.object({ earned: z.number(), max: z.literal(10), detail: z.string() }),
  salary: z.object({ earned: z.number(), max: z.literal(10), detail: z.string() }),
  language: z.object({ earned: z.number(), max: z.literal(5), detail: z.string() }),
  responsibilities: z.object({ earned: z.number(), max: z.literal(5), detail: z.string() }),
  other: z.object({ earned: z.number(), max: z.literal(5), detail: z.string() }),
});
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;

export const jobAnalysisSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobFingerprint: z.string(),
  profileVersion: z.number(),
  analysisVersion: z.number(),
  createdAt: z.number(),
  score: z.number().min(0).max(100),
  band: z.enum(RECOMMENDATION_BANDS),
  breakdown: scoreBreakdownSchema,
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  bonusSkills: z.array(z.string()),
  seniorityMatch: z.boolean(),
  salaryMatch: z.boolean(),
  locationMatch: z.boolean(),
  languageMatch: z.boolean(),
  experienceMatch: z.boolean(),
  redFlags: z.array(redFlagSchema),
  reasoning: z.string(),
  summary: z.string(),
  /** false, если анализ выполнен только детерминированным сопоставлением (без AI). */
  usedAI: z.boolean(),
  providerId: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export const coverLetterSchema = z.object({
  subject: z.string().max(200).default(''),
  body: z.string().max(6000),
  tone: z.string().max(40).default('professional'),
  /** Утверждения, которые модель не смогла подтвердить профилем — показываются пользователю. */
  unverifiedClaims: z.array(z.string().max(300)).default([]),
  status: z.enum(['ok', 'needs_user_confirmation']).default('ok'),
});
export type CoverLetter = z.infer<typeof coverLetterSchema>;

export const FORM_FIELD_TYPES = [
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'country',
  'city',
  'address',
  'linkedin',
  'github',
  'portfolio',
  'website',
  'current_company',
  'current_position',
  'desired_position',
  'experience_years',
  'current_salary',
  'expected_salary',
  'notice_period',
  'available_from',
  'education',
  'skills',
  'cover_letter',
  'resume',
  'work_authorization',
  'visa_sponsorship',
  'relocation',
  'remote_preference',
  'employment_type',
  'languages',
  'gender',
  'ethnicity',
  'veteran_status',
  'disability_status',
  'referral_source',
  'consent',
  'open_question',
  'unknown',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const aiFormFieldSchema = z.object({
  fieldId: z.string(),
  fieldType: z.enum(FORM_FIELD_TYPES),
  profilePath: z.string().max(80).nullable().default(null),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300).default(''),
});
export type AIFormFieldMapping = z.infer<typeof aiFormFieldSchema>;

export const aiFormAnalysisSchema = z.object({
  fields: z.array(aiFormFieldSchema).max(120),
});
export type AIFormAnalysis = z.infer<typeof aiFormAnalysisSchema>;

export const applicationAnswerSchema = z.object({
  answer: z.string().max(4000),
  status: z.enum(['ok', 'needs_user_confirmation']),
  /** Заполняется, когда статус — needs_user_confirmation. */
  missingInformation: z.array(z.string().max(300)).default([]),
  usedProfileFacts: z.array(z.string().max(200)).default([]),
});
export type ApplicationAnswer = z.infer<typeof applicationAnswerSchema>;

export const resumeAnalysisSchema = z.object({
  skills: z.array(z.object({ name: z.string().max(60), category: z.string().max(30) })).default([]),
  experience: z
    .array(
      z.object({
        company: z.string().max(120),
        position: z.string().max(120),
        period: z.string().max(60).default(''),
        technologies: z.array(z.string().max(60)).default([]),
      }),
    )
    .default([]),
  education: z
    .array(z.object({ institution: z.string().max(160), degree: z.string().max(120).default('') }))
    .default([]),
  languages: z
    .array(z.object({ name: z.string().max(40), level: z.string().max(20).default('') }))
    .default([]),
  achievements: z.array(z.string().max(300)).default([]),
  totalExperienceYears: z.number().min(0).max(60).nullable().default(null),
  notes: z.string().max(1000).default(''),
});
export type ResumeAnalysis = z.infer<typeof resumeAnalysisSchema>;

export const assistantReplySchema = z.object({
  answer: z.string().max(6000),
  /** Идентификаторы вакансий, на которые сослался ассистент, чтобы UI дал на них ссылки. */
  referencedJobIds: z.array(z.string()).max(50).default([]),
  followUps: z.array(z.string().max(200)).max(5).default([]),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

export interface AIUsageRecord {
  id: string;
  at: number;
  task: AITask;
  providerId: AIProviderId;
  model: string;
  promptChars: number;
  completionChars: number;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedCostUsd: number | null;
  durationMs: number;
  ok: boolean;
  errorCode: string | null;
}
