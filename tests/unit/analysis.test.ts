import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobPilotDatabase, getDb, setDb } from '@/database/db';
import { saveProfile } from '@/database/repositories/profileRepository';
import { getSettings, saveSettings } from '@/database/repositories/settingsRepository';
import { upsertExtractedJob } from '@/database/repositories/jobRepository';
import { countRequestsToday } from '@/database/repositories/usageRepository';
import { analyzeJob } from '@/core/analysis/analyzeJob';
import { setApiKey } from '@/core/ai/keyStore';
import { PROVIDERS } from '@/providers/registry';
import { makeProfile } from '../fixtures/profile';
import { makeJob } from '../fixtures/jobs';

let counter = 0;

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

describe('analysis pipeline', () => {
  it('scores deterministically when AI is disabled', async () => {
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

  it('reuses a cached analysis for the same profile version', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const profile = makeProfile();
    const settings = await getSettings();
    const first = await analyzeJob(job, profile, settings);
    const second = await analyzeJob(first.job, profile, settings);

    expect(second.fromCache).toBe(true);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(await getDb().analyses.count()).toBe(1);
  });

  it('recomputes when the profile version changes', async () => {
    const { job } = await upsertExtractedJob(makeJob());
    const settings = await getSettings();
    const first = await analyzeJob(job, makeProfile({ version: 3 }), settings);
    const second = await analyzeJob(first.job, makeProfile({ version: 4 }), settings);

    expect(second.fromCache).toBe(false);
    expect(await getDb().analyses.count()).toBe(2);
  });

  it('uses AI findings when a provider is configured', async () => {
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

  it('falls back to deterministic scoring when the provider fails', async () => {
    await enableAI();
    vi.spyOn(PROVIDERS.openai, 'chat').mockRejectedValue(new Error('network down'));

    const { job } = await upsertExtractedJob(makeJob());
    const outcome = await analyzeJob(job, makeProfile(), await getSettings());

    expect(outcome.analysis.usedAI).toBe(false);
    expect(outcome.analysis.score).toBeGreaterThan(0);
  });

  it('falls back when the model returns malformed JSON', async () => {
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

  it('respects the daily request limit', async () => {
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

  it('sends no personal data to the provider', async () => {
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
