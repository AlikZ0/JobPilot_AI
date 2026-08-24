import { z } from 'zod';
import { applicationSchema, applicationQuestionSchema } from '@/types/application';
import { jobAnalysisSchema } from '@/types/ai';
import { jobSchema } from '@/types/job';
import { userProfileSchema } from '@/types/profile';
import { settingsSchema } from '@/types/settings';
import { submissionSchema } from '@/types/submission';

export const EXPORT_VERSION = 1;

export const exportBundleSchema = z.object({
  version: z.number().int().min(1),
  exportedAt: z.string(),
  app: z.string().default('jobpilot-ai'),
  appVersion: z.string().default(''),
  profile: userProfileSchema.nullable().default(null),
  settings: settingsSchema.nullable().default(null),
  jobs: z.array(jobSchema).default([]),
  analyses: z.array(jobAnalysisSchema).default([]),
  applications: z.array(applicationSchema).default([]),
  /** Появился во второй версии формата; старые файлы импортируются без него. */
  submissions: z.array(submissionSchema).default([]),
});
export type ExportBundle = z.infer<typeof exportBundleSchema>;

export const importOptionsSchema = z.object({
  profile: z.boolean().default(true),
  settings: z.boolean().default(true),
  jobs: z.boolean().default(true),
  applications: z.boolean().default(true),
  mode: z.enum(['merge', 'replace']).default('merge'),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export {
  applicationQuestionSchema,
  applicationSchema,
  submissionSchema,
  jobSchema,
  userProfileSchema,
  settingsSchema,
};
