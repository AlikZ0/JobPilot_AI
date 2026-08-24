import {
  aiFormAnalysisSchema,
  aiJobFindingsSchema,
  applicationAnswerSchema,
  assistantReplySchema,
  coverLetterSchema,
  resumeAnalysisSchema,
  type AIProviderId,
  type AITask,
} from '@/types/ai';
import type { z } from 'zod';
import {
  buildApplicationAnswerPrompt,
  buildAssistantPrompt,
  buildCoverLetterPrompt,
  buildFormAnalysisPrompt,
  buildJobAnalysisPrompt,
  buildResumeAnalysisPrompt,
} from '@/core/ai/prompts';
import { parseAIJson } from '@/core/ai/jsonParse';
import type {
  AIProvider,
  ApplicationQuestionInput,
  AssistantInput,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  CoverLetterInput,
  FormAnalysisInput,
  JobAnalysisInput,
  ProviderCredentials,
  ResumeAnalysisInput,
  TaskContext,
  TaskResult,
} from '@/core/ai/types';

/**
 * Implements every AI task in terms of a single `chat` call, so a new provider
 * only has to speak its own HTTP dialect.
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly id: AIProviderId;
  abstract readonly label: string;
  abstract readonly defaultBaseUrl: string;
  abstract readonly suggestedModels: string[];

  abstract chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse>;

  protected async run<S extends z.ZodTypeAny>(
    task: AITask,
    messages: ChatMessage[],
    schema: S,
    ctx: TaskContext,
    overrides: Partial<Pick<ChatRequest, 'temperature' | 'maxTokens'>> = {},
  ): Promise<TaskResult<z.infer<S>>> {
    const started = Date.now();
    const request: ChatRequest = {
      messages,
      json: true,
      temperature: overrides.temperature ?? ctx.config.temperature,
      maxTokens: overrides.maxTokens ?? ctx.config.maxTokens,
      timeoutMs: ctx.config.timeoutMs,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    };
    const response = await this.chat(request, ctx.credentials);
    const data = parseAIJson(response.text, schema);
    return {
      data,
      task,
      model: response.model || ctx.credentials.model,
      promptChars: messages.reduce((sum, message) => sum + message.content.length, 0),
      completionChars: response.text.length,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      durationMs: Date.now() - started,
    };
  }

  analyzeJob(input: JobAnalysisInput, ctx: TaskContext) {
    return this.run('job_analysis', buildJobAnalysisPrompt(input), aiJobFindingsSchema, ctx);
  }

  generateCoverLetter(input: CoverLetterInput, ctx: TaskContext) {
    return this.run('cover_letter', buildCoverLetterPrompt(input), coverLetterSchema, ctx, {
      temperature: Math.max(ctx.config.temperature, 0.5),
    });
  }

  analyzeForm(input: FormAnalysisInput, ctx: TaskContext) {
    return this.run('form_analysis', buildFormAnalysisPrompt(input), aiFormAnalysisSchema, ctx, {
      temperature: 0,
    });
  }

  generateApplicationAnswer(input: ApplicationQuestionInput, ctx: TaskContext) {
    return this.run(
      'application_answer',
      buildApplicationAnswerPrompt(input),
      applicationAnswerSchema,
      ctx,
      { temperature: Math.max(ctx.config.temperature, 0.4) },
    );
  }

  askAssistant(input: AssistantInput, ctx: TaskContext) {
    return this.run('assistant', buildAssistantPrompt(input), assistantReplySchema, ctx);
  }

  analyzeResume(input: ResumeAnalysisInput, ctx: TaskContext) {
    return this.run(
      'resume_analysis',
      buildResumeAnalysisPrompt(input),
      resumeAnalysisSchema,
      ctx,
      {
        temperature: 0,
      },
    );
  }
}
