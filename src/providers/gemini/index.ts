import type { AIProviderId } from '@/types/ai';
import type { ChatRequest, ChatResponse, ProviderCredentials } from '@/core/ai/types';
import { BaseAIProvider } from '../shared/base';
import { postJson } from '../shared/http';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
}

/** API generateContent от Google Gemini. */
export class GeminiProvider extends BaseAIProvider {
  readonly id: AIProviderId = 'gemini';
  readonly label = 'Google Gemini';
  readonly defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  readonly apiKeyUrl = 'https://aistudio.google.com/app/apikey';
  override readonly freeTier = true;
  override readonly note = 'Бесплатный тариф с лимитом запросов в минуту и в сутки.';
  readonly suggestedModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

  async chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse> {
    const baseUrl = (credentials.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const contents = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    const data = await postJson<GeminiResponse>({
      // Ключ уходит в заголовке, а не в URL, чтобы не утёк через логи.
      url: `${baseUrl}/models/${encodeURIComponent(credentials.model)}:generateContent`,
      headers: { 'x-goog-api-key': credentials.apiKey },
      body: {
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          ...(request.json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      timeoutMs: request.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
      providerLabel: this.label,
    });

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');

    return {
      text,
      promptTokens: data.usageMetadata?.promptTokenCount ?? null,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? null,
      model: data.modelVersion ?? credentials.model,
    };
  }
}

export const geminiProvider = new GeminiProvider();
