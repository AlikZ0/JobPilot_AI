import type { AIProviderId } from '@/types/ai';
import type { ChatRequest, ChatResponse, ProviderCredentials } from '@/core/ai/types';
import { BaseAIProvider } from '../shared/base';
import { postJson } from '../shared/http';

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

/**
 * Anthropic Messages API. The system prompt is a top-level field rather than a
 * message, and the browser needs the CORS opt-in header.
 */
export class AnthropicProvider extends BaseAIProvider {
  readonly id: AIProviderId = 'anthropic';
  readonly label = 'Anthropic';
  readonly defaultBaseUrl = 'https://api.anthropic.com/v1';
  readonly suggestedModels = ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'];

  async chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse> {
    const baseUrl = (credentials.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content }));

    // Nudge JSON-only output: Anthropic has no response_format flag.
    if (request.json) {
      messages.push({ role: 'assistant', content: '{' });
    }

    const data = await postJson<AnthropicResponse>({
      url: `${baseUrl}/messages`,
      headers: {
        'x-api-key': credentials.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: credentials.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        ...(system ? { system } : {}),
        messages,
      },
      timeoutMs: request.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
      providerLabel: this.label,
    });

    const raw = (data.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
    // The prefilled "{" is not echoed back, so restore it.
    const text = request.json && !raw.trimStart().startsWith('{') ? `{${raw}` : raw;

    return {
      text,
      promptTokens: data.usage?.input_tokens ?? null,
      completionTokens: data.usage?.output_tokens ?? null,
      model: data.model ?? credentials.model,
    };
  }
}

export const anthropicProvider = new AnthropicProvider();
