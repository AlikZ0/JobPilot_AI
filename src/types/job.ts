import { z } from 'zod';
import { EMPLOYMENT_TYPES, SENIORITY_LEVELS, WORK_MODES } from './profile';

/** Жизненный цикл вакансии внутри JobPilot. См. core/state/jobState.ts. */
export const JOB_STATES = [
  'discovered',
  'queued',
  'analyzing',
  'analyzed',
  'saved',
  'application_preparing',
  'application_ready',
  'submitted',
  'rejected',
  'error',
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const JOB_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export const salaryRangeSchema = z.object({
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  currency: z.string().max(8).default(''),
  period: z.enum(['hour', 'day', 'week', 'month', 'year', 'unknown']).default('unknown'),
  raw: z.string().max(200).default(''),
});
export type SalaryRange = z.infer<typeof salaryRangeSchema>;

/** Откуда взято поле — показывает, насколько можно доверять извлечению. */
export const EXTRACTION_SOURCES = ['jsonld', 'meta', 'semantic', 'dom', 'ai', 'manual'] as const;
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];

export const extractedJobSchema = z.object({
  title: z.string().max(300).default(''),
  company: z.string().max(200).default(''),
  companyUrl: z.string().max(500).default(''),
  url: z.string().max(1000).default(''),
  description: z.string().default(''),
  requirements: z.array(z.string().max(600)).default([]),
  responsibilities: z.array(z.string().max(600)).default([]),
  benefits: z.array(z.string().max(600)).default([]),
  salary: salaryRangeSchema.default({}),
  location: z.string().max(200).default(''),
  country: z.string().max(80).default(''),
  city: z.string().max(80).default(''),
  workMode: z.enum([...WORK_MODES, 'unknown']).default('unknown'),
  seniority: z.enum([...SENIORITY_LEVELS, 'unknown']).default('unknown'),
  employmentType: z.enum([...EMPLOYMENT_TYPES, 'unknown']).default('unknown'),
  technologies: z.array(z.string().max(60)).default([]),
  languageRequirements: z.array(z.string().max(60)).default([]),
  postedAt: z.string().max(60).default(''),
  applyUrl: z.string().max(1000).default(''),
  source: z.string().max(80).default('generic'),
  /** Происхождение каждого поля, например { title: 'jsonld', salary: 'dom' }. */
  fieldSources: z.record(z.string(), z.enum(EXTRACTION_SOURCES)).default({}),
  extractionQuality: z.number().min(0).max(1).default(0),
});
export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export const jobSummarySchema = z.object({
  title: z.string().max(300).default(''),
  company: z.string().max(200).default(''),
  location: z.string().max(200).default(''),
  url: z.string().max(1000),
  listingId: z.string().max(200).default(''),
  salaryHint: z.string().max(200).default(''),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

export const jobSchema = extractedJobSchema.extend({
  id: z.string(),
  /** Стабильный хеш содержимого для поиска дублей между разными job-сайтами. */
  fingerprint: z.string(),
  state: z.enum(JOB_STATES).default('discovered'),
  priority: z.enum(JOB_PRIORITIES).default('normal'),
  score: z.number().min(0).max(100).nullable().default(null),
  discoveredAt: z.number(),
  updatedAt: z.number(),
  analyzedAt: z.number().nullable().default(null),
  savedAt: z.number().nullable().default(null),
  /** Идентификатор записи, признанной той же самой вакансией. */
  duplicateOf: z.string().nullable().default(null),
  notes: z.string().max(4000).default(''),
  /**
   * Свои пометки для разбора списка: «удалёнка», «хорошая зп», «спросить про
   * овертаймы». Свободный текст, а не перечисление: чужой набор ярлыков всё
   * равно не совпадёт с тем, как человек делит вакансии у себя в голове.
   */
  tags: z.array(z.string().max(30)).max(20).default([]),
  error: z.string().max(600).default(''),
  scanSessionId: z.string().nullable().default(null),
});
export type Job = z.infer<typeof jobSchema>;

export interface JobFingerprintInput {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
}
