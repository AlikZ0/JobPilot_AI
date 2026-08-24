import { z } from 'zod';
import { AI_PROVIDER_IDS } from './ai';

export const AI_MODE = ['local', 'cloud'] as const;
export type AIMode = (typeof AI_MODE)[number];

export const providerConfigSchema = z.object({
  /** Model id is never hardcoded — the user picks it per provider. */
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
  /** Hard-locked to true. The UI renders it disabled; validation re-forces it. */
  requireConfirmationBeforeSubmit: z.literal(true).default(true),
  maxJobsPerSession: z.number().int().min(1).max(500).default(50),
  maxConcurrentTabs: z.number().int().min(1).max(3).default(1),
  delayBetweenJobsMs: z.number().int().min(500).max(60_000).default(2500),
  minScoreToPrepareApplication: z.number().int().min(0).max(100).default(85),
  skipAlreadyAnalyzed: z.boolean().default(true),
});
export type AutomationSettings = z.infer<typeof automationSettingsSchema>;

export const notificationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  minScore: z.number().int().min(0).max(100).default(85),
  notifyOnScanComplete: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const privacySettingsSchema = z.object({
  /** Send job text to the configured AI provider at all. */
  allowAIRequests: z.boolean().default(false),
  /** Include work history in AI prompts (needed for good cover letters). */
  shareExperienceWithAI: z.boolean().default(true),
  /** Contact details are never shared regardless; kept for explicitness. */
  shareContactDetailsWithAI: z.literal(false).default(false),
  storeAIResponses: z.boolean().default(true),
  analyticsEnabled: z.boolean().default(true),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const costControlSchema = z.object({
  maxDescriptionChars: z.number().int().min(500).max(20_000).default(6000),
  cacheAnalyses: z.boolean().default(true),
  dailyRequestLimit: z.number().int().min(0).max(10_000).default(200),
  /** Rough per-1K-token price used only for the local usage estimate. */
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
  /** Preferred output language for AI-generated text. */
  generationLanguage: z.string().max(40).default('English'),
  automation: automationSettingsSchema.default({}),
  notifications: notificationSettingsSchema.default({}),
  privacy: privacySettingsSchema.default({}),
  costControl: costControlSchema.default({}),
  jobSites: z
    .array(z.object({ host: z.string().max(200), enabled: z.boolean().default(true) }))
    .default([]),
  defaultResumeId: z.string().nullable().default(null),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({
  id: 'primary',
  version: 1,
  updatedAt: 0,
});
