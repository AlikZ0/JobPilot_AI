import type { ChatMessage } from '@/core/ai/types';
import { runAITask } from '@/core/ai/aiService';
import { buildAIProfile } from '@/core/ai/profileProjection';
import { getProfile } from '@/database/repositories/profileRepository';
import { getSettings } from '@/database/repositories/settingsRepository';
import { appendAssistantMessage } from '@/database/repositories/assistantRepository';
import { buildAssistantContext } from './contextBuilder';

export interface AssistantRequest {
  prompt: string;
  jobId?: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}

export interface AssistantResponse {
  answer: string;
  referencedJobIds: string[];
  followUps: string[];
}

/**
 * Answers a question using only the local data the question actually needs —
 * the assistant never receives the whole database.
 */
export async function answerAssistantQuestion(
  request: AssistantRequest,
): Promise<AssistantResponse> {
  const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
  const { context } = await buildAssistantContext(request.prompt, request.jobId);
  const history: ChatMessage[] = request.history.slice(-6).map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));

  await appendAssistantMessage('user', request.prompt, request.jobId ?? null);

  const result = await runAITask(
    'assistant',
    (resolved) =>
      resolved.provider.askAssistant(
        {
          profile: buildAIProfile(profile, {
            includeExperience: settings.privacy.shareExperienceWithAI,
          }),
          context,
          history,
          question: request.prompt,
          language: settings.generationLanguage,
        },
        resolved.ctx,
      ),
    { settings },
  );

  await appendAssistantMessage('assistant', result.data.answer, request.jobId ?? null);
  return {
    answer: result.data.answer,
    referencedJobIds: result.data.referencedJobIds,
    followUps: result.data.followUps,
  };
}
