import { getDb, clearAllData } from './db';
import {
  EXPORT_VERSION,
  exportBundleSchema,
  importOptionsSchema,
  type ExportBundle,
  type ImportOptions,
} from './schemas';
import { getProfileOrNull, replaceProfile } from './repositories/profileRepository';
import { getSettings, replaceSettings } from './repositories/settingsRepository';
import { bulkPutJobs } from './repositories/jobRepository';
import { bulkPutAnalyses } from './repositories/analysisRepository';
import { bulkPutApplications } from './repositories/applicationRepository';
import { bulkPutSubmissions } from './repositories/submissionRepository';

const APP_VERSION = '0.1.0';

/**
 * Полный локальный экспорт. API-ключи намеренно не включены: они живут в
 * chrome.storage, никогда не попадают в базу и не покидают браузер.
 */
export async function exportAllData(): Promise<ExportBundle> {
  const db = getDb();
  const [profile, settings, jobs, analyses, applications, submissions] = await Promise.all([
    getProfileOrNull(),
    getSettings(),
    db.jobs.toArray(),
    db.analyses.toArray(),
    db.applications.toArray(),
    db.submissions.toArray(),
  ]);
  return exportBundleSchema.parse({
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'jobpilot-ai',
    appVersion: APP_VERSION,
    profile,
    settings,
    jobs,
    analyses,
    applications,
    submissions,
  });
}

export interface ImportSummary {
  profile: boolean;
  settings: boolean;
  jobs: number;
  analyses: number;
  applications: number;
  submissions: number;
  warnings: string[];
}

export function parseBundle(raw: unknown): ExportBundle {
  const bundle = exportBundleSchema.parse(raw);
  if (bundle.version > EXPORT_VERSION) {
    throw new Error(
      `Этот файл создан более новой версией JobPilot (v${bundle.version}). Сначала обновите расширение.`,
    );
  }
  return bundle;
}

export async function importData(
  raw: unknown,
  options: Partial<ImportOptions> = {},
): Promise<ImportSummary> {
  const bundle = parseBundle(raw);
  const opts = importOptionsSchema.parse(options);
  const summary: ImportSummary = {
    profile: false,
    settings: false,
    jobs: 0,
    analyses: 0,
    applications: 0,
    submissions: 0,
    warnings: [],
  };

  if (opts.mode === 'replace') await clearAllData();

  if (opts.profile && bundle.profile) {
    await replaceProfile(bundle.profile);
    summary.profile = true;
  }
  if (opts.settings && bundle.settings) {
    await replaceSettings(bundle.settings);
    summary.settings = true;
  }
  if (opts.jobs) {
    await bulkPutJobs(bundle.jobs);
    summary.jobs = bundle.jobs.length;
    await bulkPutAnalyses(bundle.analyses);
    summary.analyses = bundle.analyses.length;
  }
  if (opts.applications) {
    const jobIds = new Set((await getDb().jobs.toArray()).map((job) => job.id));
    const importable = bundle.applications.filter((app) => jobIds.has(app.jobId));
    const orphans = bundle.applications.length - importable.length;
    if (orphans > 0) summary.warnings.push(`Пропущено заявок: ${orphans} — нет исходной вакансии.`);
    await bulkPutApplications(importable);
    summary.applications = importable.length;

    const importableSubmissions = bundle.submissions.filter((row) => jobIds.has(row.jobId));
    await bulkPutSubmissions(importableSubmissions);
    summary.submissions = importableSubmissions.length;
  }
  return summary;
}

export function bundleToBlob(bundle: ExportBundle): Blob {
  return new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
}

export function suggestedExportFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `jobpilot-export-${stamp}.json`;
}
