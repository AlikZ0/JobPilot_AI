import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobPilotDatabase, getDb, setDb } from '@/database/db';
import { saveProfile } from '@/database/repositories/profileRepository';
import { getSettings, saveSettings } from '@/database/repositories/settingsRepository';
import { upsertExtractedJob } from '@/database/repositories/jobRepository';
import { countRequestsToday } from '@/database/repositories/usageRepository';
import { getLatestAnalysis } from '@/database/repositories/analysisRepository';
import { analyzeJob } from '@/core/analysis/analyzeJob';
import { rescoreStoredJobs } from '@/core/scoring/rescore';
import { DEFAULT_WEIGHTS_KEY, WEIGHT_PRESETS } from '@/core/scoring/weights';
import { setApiKey } from '@/core/ai/keyStore';
import { PROVIDERS } from '@/providers/registry';
import { makeProfile } from '../fixtures/profile';
import { makeJob } from '../fixtures/jobs';

let counter = 0;

const presetWeights = (id: string) => {
  const preset = WEIGHT_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(`в наборе нет пресета «${id}»`);
  return { ...preset.weights };
};

const AI_FINDINGS = {
  matchedSkills: ['Node.js', 'TypeScript', 'Docker'],
  missingSkills: ['AWS'],
  bonusSkills: ['Redis'],
  mandatorySkills: ['Node.js', 'TypeScript'],
  detectedSeniority: 'senior',
  requiredExperienceYears: 5,
  languageRequirements: [{ language: 'English', level: 'B2' }],
  responsibilitiesAlignment: 0.9,
  cultureNotes: '',
  redFlags: [],
  reasoning: 'Strong overlap with the required stack.',
  summary: 'Great fit.',
  confidence: 0.9,
};

beforeEach(async () => {
  counter += 1;
  setDb(new JobPilotDatabase(`jobpilot-analysis-${counter}`));
  await getDb().open();
  await saveProfile(makeProfile(), { bumpVersion: false });
  vi.restoreAllMocks();
});

async function enableAI() {
  await setApiKey('openai', 'sk-test-key');
  await saveSettings({
    privacy: { ...(await getSettings()).privacy, allowAIRequests: true },
    activeProvider: 'openai',
    providers: {
      openai: {
        model: 'gpt-4.1-mini',
        baseUrl: '',
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: 30_000,
      },
    },
  });
}

describe('конвейер анализа', () => {
  it('считает балл детерминированно, когда AI выключен', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const profile = makeProfile();
    const settings = await getSettings();
    const outcome = await analyzeJob(job, profile, settings);

    expect(outcome.analysis.usedAI).toBe(false);
    expect(outcome.analysis.score).toBeGreaterThan(0);
    expect(outcome.analysis.reasoning).toContain('Scored without AI');
    expect(outcome.job.score).toBe(outcome.analysis.score);
    expect(outcome.job.state).toBe('analyzed');
    expect(await countRequestsToday()).toBe(0);
  });

  it('переиспользует кеш для той же версии профиля', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const profile = makeProfile();
    const settings = await getSettings();
    const first = await analyzeJob(job, profile, settings);
    const second = await analyzeJob(first.job, profile, settings);

    expect(second.fromCache).toBe(true);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(await getDb().analyses.count()).toBe(1);
  });

  it('не переиспользует кеш после смены весов приоритетов', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const profile = makeProfile();
    const first = await analyzeJob(job, profile, await getSettings());
    expect(first.analysis.weightsKey).toBe(DEFAULT_WEIGHTS_KEY);
    expect(first.analysis.breakdown.salary.max).toBe(10);

    const moneyFirst = await saveSettings({
      scoring: {
        weights: presetWeights('money'),
        preset: 'money',
      },
    });
    const second = await analyzeJob(first.job, profile, moneyFirst);

    expect(second.fromCache).toBe(false);
    // Разбор считается по новым максимумам, и это видно в самом разборе.
    expect(second.analysis.breakdown.salary.max).toBe(30);
    expect(second.analysis.weightsKey).not.toBe(DEFAULT_WEIGHTS_KEY);
    expect(await getDb().analyses.count()).toBe(2);

    // Вернули прежний расклад — прежний разбор снова годится, считать нечего.
    const back = await analyzeJob(
      second.job,
      profile,
      await saveSettings({
        scoring: { weights: presetWeights('balanced'), preset: 'balanced' },
      }),
    );
    expect(back.fromCache).toBe(true);
    expect(back.analysis.id).toBe(first.analysis.id);
  });

  it('сохраняет выводы AI и пересчитывает балл под новые веса без нового запроса', async () => {
    await enableAI();
    const chat = vi.spyOn(PROVIDERS.openai, 'chat').mockResolvedValue({
      text: JSON.stringify(AI_FINDINGS),
      promptTokens: 900,
      completionTokens: 120,
      model: 'gpt-4.1-mini',
    });

    const { job } = await upsertExtractedJob(makeJob());
    const profile = makeProfile();
    const first = await analyzeJob(job, profile, await getSettings());
    expect(first.analysis.findings?.summary).toBe('Great fit.');

    const remoteFirst = await saveSettings({
      scoring: {
        weights: presetWeights('remote'),
        preset: 'remote',
      },
    });
    const outcome = await rescoreStoredJobs(profile, remoteFirst);

    expect(outcome.rescored).toBe(1);
    expect(outcome.withoutFindings).toBe(0);
    // Пересчёт идёт по сохранённым выводам: второго запроса к провайдеру нет.
    expect(chat).toHaveBeenCalledOnce();
    expect(await countRequestsToday()).toBe(1);

    const latest = await getLatestAnalysis(job.id);
    expect(latest?.usedAI).toBe(true);
    expect(latest?.breakdown.location.max).toBe(30);
    expect(latest?.score).not.toBe(first.analysis.score);
  });

  it('не хранит выводы AI, когда хранение ответов выключено', async () => {
    await enableAI();
    vi.spyOn(PROVIDERS.openai, 'chat').mockResolvedValue({
      text: JSON.stringify(AI_FINDINGS),
      promptTokens: 900,
      completionTokens: 120,
      model: 'gpt-4.1-mini',
    });
    const settings = await saveSettings({
      privacy: { ...(await getSettings()).privacy, storeAIResponses: false },
    });

    const { job } = await upsertExtractedJob(makeJob());
    const outcome = await analyzeJob(job, makeProfile(), settings);

    expect(outcome.analysis.usedAI).toBe(true);
    expect(outcome.analysis.findings).toBeNull();
    expect(outcome.analysis.reasoning).toBe('');
  });

  it('пересчитывает при смене версии профиля', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const settings = await getSettings();
    const first = await analyzeJob(job, makeProfile({ version: 3 }), settings);
    const second = await analyzeJob(first.job, makeProfile({ version: 4 }), settings);

    expect(second.fromCache).toBe(false);
    expect(await getDb().analyses.count()).toBe(2);
  });

  it('использует выводы AI, если провайдер настроен', async () => {
    await enableAI();
    const chat = vi.spyOn(PROVIDERS.openai, 'chat').mockResolvedValue({
      text: JSON.stringify(AI_FINDINGS),
      promptTokens: 900,
      completionTokens: 120,
      model: 'gpt-4.1-mini',
    });

    const { job } = await upsertExtractedJob(makeJob());
    const outcome = await analyzeJob(job, makeProfile(), await getSettings());

    expect(chat).toHaveBeenCalledOnce();
    expect(outcome.analysis.usedAI).toBe(true);
    expect(outcome.analysis.model).toBe('gpt-4.1-mini');
    expect(outcome.analysis.summary).toBe('Great fit.');
    expect(await countRequestsToday()).toBe(1);
  });

  it('откатывается к детерминированному скорингу при сбое провайдера', async () => {
    await enableAI();
    vi.spyOn(PROVIDERS.openai, 'chat').mockRejectedValue(new Error('network down'));

    const { job } = await upsertExtractedJob(makeJob());
    const outcome = await analyzeJob(job, makeProfile(), await getSettings());

    expect(outcome.analysis.usedAI).toBe(false);
    expect(outcome.analysis.score).toBeGreaterThan(0);
  });

  it('откатывается, если модель вернула битый JSON', async () => {
    await enableAI();
    vi.spyOn(PROVIDERS.openai, 'chat').mockResolvedValue({
      text: 'Sorry, I cannot do that.',
      promptTokens: null,
      completionTokens: null,
      model: 'gpt-4.1-mini',
    });

    const { job } = await upsertExtractedJob(makeJob());
    const outcome = await analyzeJob(job, makeProfile(), await getSettings());
    expect(outcome.analysis.usedAI).toBe(false);
  });

  it('соблюдает дневной лимит запросов', async () => {
    await enableAI();
    await saveSettings({
      costControl: { ...(await getSettings()).costControl, dailyRequestLimit: 1 },
    });
    const chat = vi.spyOn(PROVIDERS.openai, 'chat').mockResolvedValue({
      text: JSON.stringify(AI_FINDINGS),
      promptTokens: 10,
      completionTokens: 10,
      model: 'gpt-4.1-mini',
    });

    const first = await upsertExtractedJob(makeJob());
    await analyzeJob(first.job, makeProfile(), await getSettings(), { force: true });
    const second = await upsertExtractedJob(
      makeJob({ title: 'Senior Vue Engineer', url: 'https://x.test/2' }),
    );
    const outcome = await analyzeJob(second.job, makeProfile(), await getSettings(), {
      force: true,
    });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(outcome.analysis.usedAI).toBe(false);
  });

  it('не отправляет провайдеру персональные данные', async () => {
    await enableAI();
    const chat = vi.spyOn(PROVIDERS.openai, 'chat').mockResolvedValue({
      text: JSON.stringify(AI_FINDINGS),
      promptTokens: 10,
      completionTokens: 10,
      model: 'gpt-4.1-mini',
    });

    const { job } = await upsertExtractedJob(makeJob());
    await analyzeJob(job, makeProfile(), await getSettings());

    const payload = JSON.stringify(chat.mock.calls[0]![0].messages);
    expect(payload).not.toContain('alex@example.com');
    expect(payload).not.toContain('+1 555 0100');
  });
});
