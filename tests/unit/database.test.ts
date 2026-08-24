import { beforeEach, describe, expect, it } from 'vitest';
import { JobPilotDatabase, clearAllData, getDb, setDb } from '@/database/db';
import {
  getProfile,
  saveProfile,
  isProfileUsable,
} from '@/database/repositories/profileRepository';
import { getSettings, saveSettings } from '@/database/repositories/settingsRepository';
import {
  getJob,
  listJobs,
  markJobSaved,
  updateJob,
  upsertExtractedJob,
  deleteJob,
} from '@/database/repositories/jobRepository';
import {
  ANALYSIS_VERSION,
  findCachedAnalysis,
  saveAnalysis,
} from '@/database/repositories/analysisRepository';
import {
  createApplication,
  markSubmitted,
  updateApplication,
  listApplicationEvents,
} from '@/database/repositories/applicationRepository';
import { exportAllData, importData } from '@/database/transfer';
import { makeJob } from '../fixtures/jobs';
import { makeProfile } from '../fixtures/profile';

let counter = 0;

beforeEach(async () => {
  counter += 1;
  setDb(new JobPilotDatabase(`jobpilot-test-${counter}`));
  await getDb().open();
});

describe('репозиторий профиля', () => {
  it('создаёт профиль по умолчанию при первом чтении', async () => {
    const profile = await getProfile();
    expect(profile.id).toBe('primary');
    expect(profile.version).toBe(1);
    expect(profile.onboardingCompleted).toBe(false);
    expect(isProfileUsable(profile)).toBe(false);
  });

  it('увеличивает версию при каждом сохранении', async () => {
    await getProfile();
    const first = await saveProfile({
      personal: { firstName: 'Alex', lastName: '', email: '', phone: '' },
    });
    expect(first.version).toBe(2);
    const second = await saveProfile({
      professional: { ...first.professional, experienceYears: 6 },
    });
    expect(second.version).toBe(3);
  });

  it('умеет сохранять без увеличения версии', async () => {
    const before = await getProfile();
    const after = await saveProfile({ notes: undefined } as never, { bumpVersion: false });
    expect(after.version).toBe(before.version);
  });
});

describe('репозиторий настроек', () => {
  it('всегда принудительно включает подтверждение отправки', async () => {
    await getSettings();
    const updated = await saveSettings({
      automation: {
        ...(await getSettings()).automation,
        requireConfirmationBeforeSubmit: false as never,
      },
    });
    expect(updated.automation.requireConfirmationBeforeSubmit).toBe(true);
    expect(updated.privacy.shareContactDetailsWithAI).toBe(false);
  });

  it('подставляет значения по умолчанию для новых полей', async () => {
    const settings = await getSettings();
    expect(settings.automation.maxConcurrentTabs).toBe(1);
    expect(settings.privacy.allowAIRequests).toBe(false);
  });
});

describe('репозиторий вакансий', () => {
  it('сохраняет извлечённую вакансию и назначает отпечаток', async () => {
    const { job, created } = await upsertExtractedJob(makeJob());
    expect(created).toBe(true);
    expect(job.fingerprint).toBeTruthy();
    expect(job.state).toBe('discovered');
    expect(await getJob(job.id)).not.toBeNull();
  });

  it('схлопывает дубли вместо создания второй записи', async () => {
    const first = await upsertExtractedJob(makeJob());
    const second = await upsertExtractedJob(
      makeJob({
        url: 'https://indeed.com/viewjob?jk=1',
        title: 'Senior Node.js Developer (m/f/d)',
      }),
    );
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(await listJobs()).toHaveLength(1);
  });

  it('при слиянии оставляет более полное описание', async () => {
    await upsertExtractedJob(makeJob({ description: 'short' }));
    const long = 'a much longer description '.repeat(20);
    const merged = await upsertExtractedJob(makeJob({ description: long }));
    expect(merged.job.description).toBe(long);
  });

  it('отклоняет недопустимый переход состояния', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    await expect(updateJob(job.id, { state: 'submitted' })).rejects.toThrow(
      /Недопустимый переход вакансии/,
    );
  });

  it('помечает вакансию сохранённой и запоминает момент', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const saved = await markJobSaved(job.id);
    expect(saved.state).toBe('saved');
    expect(saved.savedAt).not.toBeNull();
  });

  it('не откатывает состояние, если по вакансии уже готова заявка', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    await markJobSaved(job.id);
    await updateJob(job.id, { state: 'application_preparing' });
    const ready = await updateJob(job.id, { state: 'application_ready' });

    const saved = await markJobSaved(job.id);
    expect(saved.state).toBe('application_ready');
    expect(saved.savedAt).toBe(ready.savedAt);
  });

  it('удаляет вместе с вакансией её анализы и заявки', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    await createApplication(job.id);
    await deleteJob(job.id);
    expect(await getJob(job.id)).toBeNull();
    expect(await getDb().applications.count()).toBe(0);
  });
});

describe('кеш анализов', () => {
  it('переиспользует анализ только для той же версии профиля и скоринга', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    await saveAnalysis({
      id: 'ana1',
      jobId: job.id,
      jobFingerprint: job.fingerprint,
      profileVersion: 3,
      analysisVersion: ANALYSIS_VERSION,
      createdAt: Date.now(),
      score: 88,
      band: 'good_match',
      breakdown: {
        technicalSkills: { earned: 36, max: 40, detail: '' },
        experience: { earned: 15, max: 15, detail: '' },
        seniority: { earned: 10, max: 10, detail: '' },
        location: { earned: 10, max: 10, detail: '' },
        salary: { earned: 8, max: 10, detail: '' },
        language: { earned: 5, max: 5, detail: '' },
        responsibilities: { earned: 4, max: 5, detail: '' },
        other: { earned: 4, max: 5, detail: '' },
      },
      matchedSkills: [],
      missingSkills: [],
      bonusSkills: [],
      versionMismatches: [],
      seniorityMatch: true,
      salaryMatch: true,
      locationMatch: true,
      languageMatch: true,
      experienceMatch: true,
      redFlags: [],
      reasoning: '',
      summary: '',
      usedAI: false,
      providerId: null,
      model: null,
    });

    expect(await findCachedAnalysis(job.fingerprint, 3)).not.toBeNull();
    expect(await findCachedAnalysis(job.fingerprint, 4)).toBeNull();
  });
});

describe('репозиторий заявок', () => {
  it('ведёт журнал событий и блокирует неподтверждённую отправку', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const application = await createApplication(job.id);
    await expect(markSubmitted(application.id, false)).rejects.toThrow(
      /явного подтверждения пользователя/,
    );

    await updateApplication(application.id, { state: 'review' });
    await updateApplication(application.id, { state: 'ready' });
    const submitted = await markSubmitted(application.id, true);
    expect(submitted.state).toBe('submitted');
    expect(submitted.submittedByUser).toBe(true);

    const events = await listApplicationEvents(application.id);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['created', 'state_changed', 'submit_confirmed']),
    );
  });

  it('переиспользует существующий черновик для той же вакансии', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const first = await createApplication(job.id);
    const second = await createApplication(job.id);
    expect(second.id).toBe(first.id);
  });
});

describe('экспорт и импорт', () => {
  it('полный набор данных переживает экспорт и импорт', async () => {
    await saveProfile(makeProfile());
    const { job } = await upsertExtractedJob(makeJob());
    await createApplication(job.id);

    const bundle = await exportAllData();
    expect(bundle.version).toBe(1);
    expect(bundle.jobs).toHaveLength(1);
    expect(JSON.stringify(bundle)).not.toContain('apikey');

    await clearAllData();
    expect(await listJobs()).toHaveLength(0);

    const summary = await importData(bundle, { mode: 'replace' });
    expect(summary.jobs).toBe(1);
    expect(summary.applications).toBe(1);
    expect((await getProfile()).personal.firstName).toBe('Alex');
  });

  it('отклоняет файл от более новой версии', async () => {
    await expect(
      importData({ version: 99, exportedAt: new Date().toISOString(), jobs: [] }),
    ).rejects.toThrow(/более новой версией/);
  });

  it('пропускает заявки без исходной вакансии', async () => {
    const bundle = await exportAllData();
    const summary = await importData(
      {
        ...bundle,
        applications: [
          {
            id: 'app1',
            jobId: 'missing',
            state: 'draft',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      { mode: 'merge' },
    );
    expect(summary.applications).toBe(0);
    expect(summary.warnings.join(' ')).toMatch(/Пропущено заявок/);
  });
});
