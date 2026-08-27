import { beforeEach, describe, expect, it } from 'vitest';
import { JobPilotDatabase, getDb, setDb } from '@/database/db';
import { upsertExtractedJob, getJob } from '@/database/repositories/jobRepository';
import { saveAnalysis, ANALYSIS_VERSION } from '@/database/repositories/analysisRepository';
import { getSettings, saveSettings } from '@/database/repositories/settingsRepository';
import { scoreJob } from '@/core/scoring/engine';
import { rescoreStoredJobs } from '@/core/scoring/rescore';
import {
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_WEIGHTS_KEY,
  SCORE_COMPONENTS,
  WEIGHT_PRESETS,
  normalizeWeights,
  presetForWeights,
  weightsKey,
} from '@/core/scoring/weights';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type { JobAnalysis } from '@/types/ai';
import { makeJob } from '../fixtures/jobs';
import { makeProfile } from '../fixtures/profile';

const sum = (weights: Record<string, number>) =>
  SCORE_COMPONENTS.reduce((total, component) => total + (weights[component] as number), 0);

let counter = 0;

beforeEach(async () => {
  counter += 1;
  setDb(new JobPilotDatabase(`jobpilot-weights-test-${counter}`));
  await getDb().open();
});

describe('нормализация весов', () => {
  it('приводит любые ползунки ровно к 100', () => {
    expect(sum(normalizeWeights())).toBe(100);
    expect(sum(normalizeWeights({ technicalSkills: 7 }))).toBe(100);
    expect(
      sum(
        normalizeWeights({
          technicalSkills: 1,
          experience: 1,
          seniority: 1,
          location: 1,
          salary: 1,
          language: 1,
          responsibilities: 1,
          other: 1,
        }),
      ),
    ).toBe(100);
    expect(sum(normalizeWeights({ technicalSkills: 60, salary: 60 }))).toBe(100);
  });

  it('не трогает веса, которые уже дают 100', () => {
    expect(normalizeWeights(DEFAULT_SCORE_WEIGHTS)).toEqual({ ...DEFAULT_SCORE_WEIGHTS });
    for (const preset of WEIGHT_PRESETS) {
      expect(sum(preset.weights)).toBe(100);
      expect(normalizeWeights(preset.weights)).toEqual(preset.weights);
    }
  });

  it('сохраняет порядок важности: больший ползунок даёт больший вес', () => {
    const weights = normalizeWeights({ technicalSkills: 10, salary: 40, location: 20 });
    expect(weights.salary).toBeGreaterThan(weights.location);
    expect(weights.location).toBeGreaterThan(weights.technicalSkills);
  });

  it('возвращает веса по умолчанию, когда все ползунки в нуле', () => {
    const zeroed = SCORE_COMPONENTS.reduce<Record<string, number>>((acc, component) => {
      acc[component] = 0;
      return acc;
    }, {});
    expect(normalizeWeights(zeroed)).toEqual({ ...DEFAULT_SCORE_WEIGHTS });
  });

  it('узнаёт свой пресет и отличает ручной расклад', () => {
    expect(presetForWeights(DEFAULT_SCORE_WEIGHTS)).toBe('balanced');
    expect(presetForWeights({ ...DEFAULT_SCORE_WEIGHTS, salary: 37 })).toBe('custom');
    // Пропорция важна, а не абсолютные числа: удвоенные ползунки — тот же расклад.
    const doubled = SCORE_COMPONENTS.reduce<Record<string, number>>((acc, component) => {
      acc[component] = DEFAULT_SCORE_WEIGHTS[component] * 2;
      return acc;
    }, {});
    expect(presetForWeights(doubled as never)).toBe('balanced');
  });
});

describe('скоринг с настроенными весами', () => {
  it('считает разбор по заданным максимумам, а сумма максимумов остаётся 100', () => {
    const result = scoreJob({
      job: makeJob(),
      profile: makeProfile(),
      weights: WEIGHT_PRESETS.find((preset) => preset.id === 'money')?.weights,
    });
    expect(result.breakdown.salary.max).toBe(30);
    expect(result.breakdown.technicalSkills.max).toBe(30);
    expect(
      sum(Object.fromEntries(Object.entries(result.breakdown).map(([k, v]) => [k, v.max]))),
    ).toBe(100);
    for (const part of Object.values(result.breakdown)) {
      expect(part.earned).toBeGreaterThanOrEqual(0);
      expect(part.earned).toBeLessThanOrEqual(part.max);
    }
  });

  it('разбор по-прежнему сходится с итоговым баллом', () => {
    const result = scoreJob({
      job: makeJob(),
      profile: makeProfile(),
      weights: { technicalSkills: 12, salary: 40 },
    });
    const total = Object.values(result.breakdown).reduce((acc, part) => acc + part.earned, 0);
    expect(result.score).toBe(Math.round(total));
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('меняет балл, когда меняются приоритеты', () => {
    const job = makeJob({
      salary: { min: 500, max: 700, currency: 'USD', period: 'month', raw: '$500 - $700' },
    });
    const profile = makeProfile();
    const balanced = scoreJob({ job, profile });
    const moneyFirst = scoreJob({ job, profile, weights: { salary: 40, technicalSkills: 20 } });
    // Слабая вилка при удвоенном весе зарплаты обязана утянуть балл вниз.
    expect(moneyFirst.score).toBeLessThan(balanced.score);
  });

  it('обнуляемый компонент перестаёт влиять на балл', () => {
    const job = makeJob({
      salary: { min: 500, max: 700, currency: 'USD', period: 'month', raw: '$500 - $700' },
    });
    const profile = makeProfile();
    const withSalary = scoreJob({ job, profile });
    const withoutSalary = scoreJob({
      job,
      profile,
      weights: { ...DEFAULT_SCORE_WEIGHTS, salary: 0 },
    });
    expect(withoutSalary.breakdown.salary.max).toBe(0);
    expect(withoutSalary.breakdown.salary.earned).toBe(0);
    expect(withoutSalary.score).toBeGreaterThan(withSalary.score);
  });

  it('подписывает балл весами, которыми он посчитан', () => {
    const result = scoreJob({ job: makeJob(), profile: makeProfile() });
    expect(result.weightsKey).toBe(DEFAULT_WEIGHTS_KEY);
    expect(weightsKey(result.weights)).toBe(result.weightsKey);
  });
});

describe('пересчёт сохранённых баллов', () => {
  const storeAnalysis = async (
    jobId: string,
    fingerprint: string,
    patch: Partial<JobAnalysis> = {},
  ) =>
    saveAnalysis({
      id: `ana-${jobId}`,
      jobId,
      jobFingerprint: fingerprint,
      profileVersion: 1,
      analysisVersion: ANALYSIS_VERSION,
      weightsKey: DEFAULT_WEIGHTS_KEY,
      createdAt: Date.now() - 1000,
      score: 50,
      band: 'weak_match',
      breakdown: {
        technicalSkills: { earned: 20, max: 40, detail: '' },
        experience: { earned: 10, max: 15, detail: '' },
        seniority: { earned: 5, max: 10, detail: '' },
        location: { earned: 5, max: 10, detail: '' },
        salary: { earned: 5, max: 10, detail: '' },
        language: { earned: 2, max: 5, detail: '' },
        responsibilities: { earned: 2, max: 5, detail: '' },
        other: { earned: 1, max: 5, detail: '' },
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
      findings: null,
      providerId: null,
      model: null,
      ...patch,
    });

  it('переписывает балл вакансии под текущие веса', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    await storeAnalysis(job.id, job.fingerprint);
    const profile = makeProfile();
    const settings = await saveSettings({
      scoring: { weights: { ...DEFAULT_SCORE_WEIGHTS, salary: 0 }, preset: 'custom' },
    });

    const outcome = await rescoreStoredJobs(profile, settings);
    expect(outcome.total).toBe(1);
    expect(outcome.rescored).toBe(1);
    expect(outcome.changed).toBe(1);

    const updated = await getJob(job.id);
    const expected = scoreJob({ job, profile, weights: settings.scoring.weights });
    expect(updated?.score).toBe(expected.score);
    expect(updated?.score).not.toBe(50);
  });

  it('не трогает вакансии, уже посчитанные текущими весами', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const profile = makeProfile();
    await storeAnalysis(job.id, job.fingerprint, { profileVersion: profile.version });
    const settings = await getSettings();

    const outcome = await rescoreStoredJobs(profile, settings);
    expect(outcome.upToDate).toBe(1);
    expect(outcome.rescored).toBe(0);
    expect((await getJob(job.id))?.score).toBe(job.score);
  });

  it('считает вакансии, у которых выводы AI не сохранялись', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    await storeAnalysis(job.id, job.fingerprint, { usedAI: true, findings: null });
    const settings = await saveSettings({
      scoring: { ...DEFAULT_SETTINGS.scoring, preset: 'money' },
    });
    const withMoneyWeights = await saveSettings({
      scoring: {
        weights:
          WEIGHT_PRESETS.find((preset) => preset.id === 'money')?.weights ??
          settings.scoring.weights,
        preset: 'money',
      },
    });

    const outcome = await rescoreStoredJobs(makeProfile(), withMoneyWeights);
    expect(outcome.withoutFindings).toBe(1);
    // Без сохранённых выводов балл считается правилами — и об этом честно сказано.
    expect(outcome.rescored).toBe(1);
  });
});
