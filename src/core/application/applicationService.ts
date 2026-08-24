import type { Application } from '@/types/application';
import type { Job } from '@/types/job';
import type { UserProfile } from '@/types/profile';
import type { Settings } from '@/types/settings';
import { runAITask } from '@/core/ai/aiService';
import { buildAIProfile } from '@/core/ai/profileProjection';
import {
  createApplication,
  getApplication,
  logApplicationEvent,
  updateApplication,
} from '@/database/repositories/applicationRepository';
import { updateJob } from '@/database/repositories/jobRepository';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { createId } from '@/utils/id';
import { truncate } from '@/utils/text';

/** Создаёт (или возобновляет) черновик заявки по вакансии. */
export async function prepareApplication(job: Job): Promise<Application> {
  const application = await createApplication(job.id);
  if (job.state !== 'submitted' && job.state !== 'application_ready') {
    await updateJob(job.id, { state: 'application_preparing' });
  }
  return application;
}

export interface CoverLetterOutcome {
  coverLetter: string;
  unverifiedClaims: string[];
  status: 'ok' | 'needs_user_confirmation';
}

export async function generateCoverLetter(
  job: Job,
  profile: UserProfile,
  settings: Settings,
  options: { applicationId?: string; tone?: string; instructions?: string } = {},
): Promise<CoverLetterOutcome> {
  const aiProfile = buildAIProfile(profile, {
    includeExperience: settings.privacy.shareExperienceWithAI,
  });
  const result = await runAITask(
    'cover_letter',
    (resolved) =>
      resolved.provider.generateCoverLetter(
        {
          profile: aiProfile,
          job: {
            ...job,
            description: truncate(job.description, settings.costControl.maxDescriptionChars),
          },
          tone: options.tone ?? 'professional',
          language: settings.generationLanguage,
          extraInstructions: options.instructions ?? '',
        },
        resolved.ctx,
      ),
    { settings },
  );

  const letter = result.data;
  if (options.applicationId) {
    const application = await getApplication(options.applicationId);
    if (application) {
      await updateApplication(application.id, {
        coverLetter: letter.body,
        coverLetterStatus: 'generated',
        unverifiedClaims: letter.unverifiedClaims,
      });
      await logApplicationEvent(
        application.id,
        application.jobId,
        'cover_letter_generated',
        `Cover letter generated (${letter.status})`,
      );
    }
  }

  return {
    coverLetter: letter.body,
    unverifiedClaims: letter.unverifiedClaims,
    status: letter.status,
  };
}

export interface AnswerOutcome {
  answer: string;
  status: 'ok' | 'needs_user_confirmation';
  missingInformation: string[];
}

export async function generateApplicationAnswer(
  job: Job,
  profile: UserProfile,
  settings: Settings,
  params: { applicationId: string; questionId: string; question: string; maxLength?: number },
): Promise<AnswerOutcome> {
  const application = await getApplication(params.applicationId);
  if (!application) {
    throw new JobPilotError(ERROR_CODES.NOT_FOUND, 'Заявка не найдена.');
  }
  const aiProfile = buildAIProfile(profile, {
    includeExperience: settings.privacy.shareExperienceWithAI,
  });
  const result = await runAITask(
    'application_answer',
    (resolved) =>
      resolved.provider.generateApplicationAnswer(
        {
          profile: aiProfile,
          job: { ...job, description: truncate(job.description, 4000) },
          question: params.question,
          maxLength: params.maxLength ?? null,
          language: settings.generationLanguage,
        },
        resolved.ctx,
      ),
    { settings },
  );

  const answer = result.data;
  const questions = application.questions.some((q) => q.id === params.questionId)
    ? application.questions.map((q) =>
        q.id === params.questionId
          ? {
              ...q,
              answer: answer.answer,
              status: answer.status,
              missingInformation: answer.missingInformation,
            }
          : q,
      )
    : [
        ...application.questions,
        {
          id: params.questionId || createId('q'),
          fieldId: null,
          question: params.question,
          answer: answer.answer,
          status: answer.status,
          missingInformation: answer.missingInformation,
          maxLength: params.maxLength ?? null,
        },
      ];

  await updateApplication(application.id, { questions });
  await logApplicationEvent(
    application.id,
    application.jobId,
    'answer_generated',
    `Answer generated (${answer.status})`,
  );

  return {
    answer: answer.answer,
    status: answer.status,
    missingInformation: answer.missingInformation,
  };
}

/**
 * Переводит заявку в `ready`. Ничего не отправляет: отправка — всегда отдельное
 * явное действие пользователя на экране проверки.
 */
export async function markApplicationReady(applicationId: string): Promise<Application> {
  const application = await getApplication(applicationId);
  if (!application) throw new JobPilotError(ERROR_CODES.NOT_FOUND, 'Заявка не найдена.');
  const next =
    application.state === 'ready'
      ? application
      : await updateApplication(applicationId, {
          state: application.state === 'review' ? 'ready' : 'review',
        });
  const finalState =
    next.state === 'ready' ? next : await updateApplication(applicationId, { state: 'ready' });
  await updateJob(application.jobId, { state: 'application_ready' });
  return finalState;
}
