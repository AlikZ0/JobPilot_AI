import { z } from 'zod';
import { AI_PROVIDER_IDS } from './ai';

export const AI_MODE = ['local', 'cloud'] as const;
export type AIMode = (typeof AI_MODE)[number];

export const providerConfigSchema = z.object({
  /** Модель нигде не захардкожена — пользователь выбирает её для каждого провайдера. */
  model: z.string().max(120).default(''),
  baseUrl: z.string().max(300).default(''),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().min(256).max(200_000).default(2048),
  timeoutMs: z.number().int().min(3_000).max(180_000).default(60_000),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const automationSettingsSchema = z.object({
  autoAnalyzeJobs: z.boolean().default(true),
  autoOpenJobs: z.boolean().default(false),
  autoFillForms: z.boolean().default(false),
  autoGenerateCoverLetter: z.boolean().default(false),
  requireConfirmationBeforeFill: z.boolean().default(true),
  /** Жёстко зафиксировано в true. В UI выключено, при валидации принудительно восстанавливается. */
  requireConfirmationBeforeSubmit: z.literal(true).default(true),
  maxJobsPerSession: z.number().int().min(1).max(500).default(50),
  maxConcurrentTabs: z.number().int().min(1).max(3).default(1),
  delayBetweenJobsMs: z.number().int().min(500).max(60_000).default(2500),
  minScoreToPrepareApplication: z.number().int().min(0).max(100).default(85),
  skipAlreadyAnalyzed: z.boolean().default(true),
  /** Вести журнал откликов автоматически: замечать отправку формы на сайте. */
  trackSubmissions: z.boolean().default(true),
  /**
   * Переводить заявку в «Отправлена», когда замечена отправка на сайте.
   * Отправляет по-прежнему человек — JobPilot только фиксирует факт.
   */
  autoMarkSubmitted: z.boolean().default(true),
  /** Показывать метки JobPilot прямо на страницах сайтов с вакансиями. */
  showPageBadges: z.boolean().default(true),
});
export type AutomationSettings = z.infer<typeof automationSettingsSchema>;

export const notificationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  minScore: z.number().int().min(0).max(100).default(85),
  notifyOnScanComplete: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const privacySettingsSchema = z.object({
  /** Разрешено ли вообще отправлять текст вакансии настроенному AI-провайдеру. */
  allowAIRequests: z.boolean().default(false),
  /** Включать ли опыт работы в промпты (нужно для хороших сопроводительных писем). */
  shareExperienceWithAI: z.boolean().default(true),
  /** Контакты не передаются в любом случае; поле оставлено ради явности. */
  shareContactDetailsWithAI: z.literal(false).default(false),
  storeAIResponses: z.boolean().default(true),
  analyticsEnabled: z.boolean().default(true),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

/**
 * Компоненты балла. Порядок фиксирован: по нему строится подпись весов, из
 * которой берётся ключ кеша анализов.
 */
export const SCORE_COMPONENTS = [
  'technicalSkills',
  'experience',
  'seniority',
  'location',
  'salary',
  'language',
  'responsibilities',
  'other',
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

/** Веса из README. В сумме обязаны давать 100. */
export const DEFAULT_SCORE_WEIGHTS = {
  technicalSkills: 40,
  experience: 15,
  seniority: 10,
  location: 10,
  salary: 10,
  language: 5,
  responsibilities: 5,
  other: 5,
} as const;

export const scoreWeightsSchema = z.object({
  technicalSkills: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.technicalSkills),
  experience: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.experience),
  seniority: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.seniority),
  location: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.location),
  salary: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.salary),
  language: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.language),
  responsibilities: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.responsibilities),
  other: z.number().min(0).max(100).default(DEFAULT_SCORE_WEIGHTS.other),
});
export type ScoreWeights = z.infer<typeof scoreWeightsSchema>;

export const scoringSettingsSchema = z.object({
  /**
   * Что для вас важнее. Ползунки хранятся как есть, а к сотне приводятся при
   * подсчёте: иначе сдвиг одного ползунка молча менял бы все остальные.
   */
  weights: scoreWeightsSchema.default({}),
  /** id пресета или `custom`, если ползунки трогали руками. */
  preset: z.string().max(40).default('balanced'),
});
export type ScoringSettings = z.infer<typeof scoringSettingsSchema>;

export const costControlSchema = z.object({
  maxDescriptionChars: z.number().int().min(500).max(20_000).default(6000),
  cacheAnalyses: z.boolean().default(true),
  dailyRequestLimit: z.number().int().min(0).max(10_000).default(200),
  /** Примерная цена за 1К токенов — только для локальной оценки расходов. */
  estimatedInputCostPer1k: z.number().min(0).default(0),
  estimatedOutputCostPer1k: z.number().min(0).default(0),
});
export type CostControlSettings = z.infer<typeof costControlSchema>;

export const settingsSchema = z.object({
  id: z.literal('primary').default('primary'),
  version: z.number().int().default(1),
  updatedAt: z.number().default(0),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  uiLanguage: z.string().max(10).default('en'),
  aiMode: z.enum(AI_MODE).default('local'),
  activeProvider: z.enum(AI_PROVIDER_IDS).default('openai'),
  providers: z.record(z.enum(AI_PROVIDER_IDS), providerConfigSchema).default({}),
  cloudEndpoint: z.string().max(300).default(''),
  /** Язык, на котором AI должен писать тексты. */
  generationLanguage: z.string().max(40).default('English'),
  automation: automationSettingsSchema.default({}),
  notifications: notificationSettingsSchema.default({}),
  privacy: privacySettingsSchema.default({}),
  costControl: costControlSchema.default({}),
  scoring: scoringSettingsSchema.default({}),
  jobSites: z
    .array(z.object({ host: z.string().max(200), enabled: z.boolean().default(true) }))
    .default([]),
  defaultResumeId: z.string().nullable().default(null),
  /**
   * Компании, вакансии которых не показываются. Сравнение по нормализованному
   * названию, поэтому «Acme» и «Acme Inc.» — это одна компания.
   */
  hiddenCompanies: z.array(z.string().max(200)).max(500).default([]),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({
  id: 'primary',
  version: 1,
  updatedAt: 0,
});
