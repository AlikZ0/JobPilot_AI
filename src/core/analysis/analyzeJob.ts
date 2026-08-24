import type { JobAnalysis } from '@/types/ai';
import type { Job } from '@/types/job';
import type { UserProfile } from '@/types/profile';
import type { Settings } from '@/types/settings';
import { scoreJob, computePriority } from '@/core/scoring/engine';
import { labelForBand } from '@/core/scoring/weights';
import { buildAIProfile } from '@/core/ai/profileProjection';
import { runAITask } from '@/core/ai/aiService';
import {
  ANALYSIS_VERSION,
  findCachedAnalysis,
  saveAnalysis,
} from '@/database/repositories/analysisRepository';
import { updateJob } from '@/database/repositories/jobRepository';
import { canTransitionJob } from '@/core/state/jobState';
import { createId } from '@/utils/id';
import { createLogger } from '@/utils/logger';
import { truncate } from '@/utils/text';

const log = createLogger('analysis');

export interface AnalyzeOptions {
  force?: boolean;
  /** Skip the AI call even when it is configured (used by bulk scans). */
  deterministicOnly?: boolean;
  signal?: AbortSignal;
}

export interface AnalyzeOutcome {
  job: Job;
  analysis: JobAnalysis;
  fromCache: boolean;
}

/**
 * The analysis pipeline: cache → optional AI findings → deterministic scoring →
 * persistence. The AI never returns the score; if it fails, the deterministic
 * result still stands, so analysis degrades instead of breaking.
 */
export async function analyzeJob(
  job: Job,
  profile: UserProfile,
  settings: Settings,
  options: AnalyzeOptions = {},
): Promise<AnalyzeOutcome> {
  if (!options.force && settings.costControl.cacheAnalyses) {
    const cached = await findCachedAnalysis(job.fingerprint, profile.version);
    if (cached) {
      const updated = await syncJobWithAnalysis(job, cached, profile);
      return { job: updated, analysis: cached, fromCache: true };
    }
  }

  // Reflect the work in the job's state so the UI (and the state machine) sees
  // the analyzing step rather than a jump straight to `analyzed`.
  let current = job;
  if (canTransitionJob(current.state, 'analyzing') && current.state !== 'saved') {
    current = await updateJob(current.id, { state: 'analyzing' });
  }

  const useAI =
    !options.deterministicOnly && settings.privacy.allowAIRequests && job.description.length > 0;

  let findings = null;
  let providerId: string | null = null;
  let model: string | null = null;

  if (useAI) {
    try {
      const aiProfile = buildAIProfile(profile, {
        includeExperience: settings.privacy.shareExperienceWithAI,
      });
      const trimmedJob = {
        ...current,
        description: truncate(job.description, settings.costControl.maxDescriptionChars),
      };
      const result = await runAITask(
        'job_analysis',
        (resolved) =>
          resolved.provider.analyzeJob(
            { profile: aiProfile, job: trimmedJob, language: settings.generationLanguage },
            resolved.ctx,
          ),
        { settings, ...(options.signal ? { signal: options.signal } : {}) },
      );
      findings = result.data;
      model = result.model;
      providerId = settings.aiMode === 'cloud' ? 'cloud' : settings.activeProvider;
    } catch (error) {
      // Deterministic scoring still produces a usable result.
      log.warn('AI analysis failed, falling back to deterministic scoring', error);
    }
  }

  const scored = scoreJob({ job: current, profile, findings });
  const analysis: JobAnalysis = {
    id: createId('ana'),
    jobId: current.id,
    jobFingerprint: current.fingerprint,
    profileVersion: profile.version,
    analysisVersion: ANALYSIS_VERSION,
    createdAt: Date.now(),
    score: scored.score,
    band: scored.band,
    breakdown: scored.breakdown,
    matchedSkills: scored.matchedSkills,
    missingSkills: scored.missingSkills,
    bonusSkills: scored.bonusSkills,
    seniorityMatch: scored.seniorityMatch,
    salaryMatch: scored.salaryMatch,
    locationMatch: scored.locationMatch,
    languageMatch: scored.languageMatch,
    experienceMatch: scored.experienceMatch,
    redFlags: scored.redFlags,
    reasoning: findings?.reasoning ?? buildDeterministicReasoning(scored),
    summary: findings?.summary ?? `${labelForBand(scored.band)} — ${scored.score}%.`,
    usedAI: Boolean(findings),
    providerId,
    model,
  };

  const stored = settings.privacy.storeAIResponses
    ? await saveAnalysis(analysis)
    : await saveAnalysis({ ...analysis, reasoning: '', summary: analysis.summary });

  const updatedJob = await syncJobWithAnalysis(current, stored, profile);
  return { job: updatedJob, analysis: stored, fromCache: false };
}

async function syncJobWithAnalysis(
  job: Job,
  analysis: JobAnalysis,
  profile: UserProfile,
): Promise<Job> {
  const priority = computePriority({ ...job, score: analysis.score }, profile);
  let current = job;

  // A job that is already saved, submitted or mid-application keeps its state;
  // everything else lands on `analyzed`, stepping through `analyzing` when the
  // state machine requires it (for example straight after discovery).
  const keepState =
    current.state === 'saved' ||
    current.state === 'submitted' ||
    current.state === 'application_preparing' ||
    current.state === 'application_ready';
  let nextState = keepState ? current.state : 'analyzed';
  if (!keepState && !canTransitionJob(current.state, 'analyzed')) {
    if (canTransitionJob(current.state, 'analyzing')) {
      current = await updateJob(current.id, { state: 'analyzing' });
    } else {
      nextState = current.state;
    }
  }

  return updateJob(current.id, {
    score: analysis.score,
    analyzedAt: analysis.createdAt,
    priority,
    state: nextState,
    error: '',
  });
}

function buildDeterministicReasoning(scored: ReturnType<typeof scoreJob>): string {
  const parts = Object.entries(scored.breakdown).map(
    ([key, value]) => `${key}: ${value.earned}/${value.max} — ${value.detail}`,
  );
  return `Scored without AI, from the posting text alone.\n${parts.join('\n')}`;
}
