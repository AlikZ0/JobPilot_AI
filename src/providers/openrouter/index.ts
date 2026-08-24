import type { AIProviderId } from '@/types/ai';
import type { ChatRequest, ChatResponse, ProviderCredentials } from '@/core/ai/types';
import { BaseAIProvider } from '../shared/base';
import { postJson } from '../shared/http';

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

export class OpenRouterProvider extends BaseAIProvider {
  readonly id: AIProviderId = 'openrouter';
  readonly label = 'OpenRouter';
  readonly defaultBaseUrl = 'https://openrouter.ai/api/v1';
  readonly suggestedModels = [
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-4.1-mini',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct',
  ];

  async chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse> {
    const baseUrl = (credentials.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const data = await postJson<OpenRouterResponse>({
      url: `${baseUrl}/chat/completions`,
      headers: {
        authorization: `Bearer ${credentials.apiKey}`,
        // OpenRouter uses these for attribution; no user data is included.
        'x-title': 'JobPilot AI',
      },
      body: {
        model: credentials.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      },
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

export const openrouterProvider = new OpenRouterProvider();
