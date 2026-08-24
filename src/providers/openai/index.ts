import type { AIProviderId } from '@/types/ai';
import type { ChatRequest, ChatResponse, ProviderCredentials } from '@/core/ai/types';
import { BaseAIProvider } from '../shared/base';
import { postJson } from '../shared/http';

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

/** OpenAI Chat Completions; та же реализация подходит любому OpenAI-совместимому API. */
export class OpenAIProvider extends BaseAIProvider {
  readonly id: AIProviderId = 'openai';
  readonly label: string = 'OpenAI';
  readonly defaultBaseUrl: string = 'https://api.openai.com/v1';
  readonly suggestedModels: string[] = [
    'gpt-4.1-mini',
    'gpt-4.1',
    'gpt-4o-mini',
    'gpt-4o',
    'o4-mini',
  ];

  async chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse> {
    const baseUrl = (credentials.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const payload: Record<string, unknown> = {
      model: credentials.model,
      messages: request.messages,
      temperature: request.temperature,
      max_completion_tokens: request.maxTokens,
    };
    if (request.json) payload.response_format = { type: 'json_object' };

    const data = await postJson<OpenAIResponse>({
      url: `${baseUrl}/chat/completions`,
      headers: { authorization: `Bearer ${credentials.apiKey}` },
      body: payload,
      timeoutMs: request.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
      providerLabel: this.label,
    });

    return {
      text: data.choices?.[0]?.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
      model: data.model ?? credentials.model,
    };
  }
}

/** Тот же формат обмена, но базовый URL задаёт пользователь (LM Studio, Ollama, vLLM, …). */
export class CustomOpenAICompatibleProvider extends OpenAIProvider {
  override readonly id: AIProviderId = 'custom';
  override readonly label = 'Custom (OpenAI-compatible)';
  override readonly defaultBaseUrl = '';
  override readonly suggestedModels: string[] = [];
}

export const openaiProvider = new OpenAIProvider();
export const customProvider = new CustomOpenAICompatibleProvider();
