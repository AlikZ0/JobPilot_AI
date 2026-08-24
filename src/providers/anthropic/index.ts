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
 * Anthropic Messages API. Системный промпт здесь — отдельное поле, а не
 * сообщение, и браузеру нужен特 заголовок, разрешающий прямой доступ.
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

    // Подталкиваем к чистому JSON: у Anthropic нет флага response_format.
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
    // Подставленную «{» модель обратно не возвращает — восстанавливаем её.
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
