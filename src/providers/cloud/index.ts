import type { AIProviderId } from '@/types/ai';
import type { ChatRequest, ChatResponse, ProviderCredentials } from '@/core/ai/types';
import { BaseAIProvider } from '../shared/base';
import { postJson } from '../shared/http';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';

interface CloudResponse {
  text?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  model?: string;
}

/**
 * CLOUD mode: requests go to a gateway you operate, which holds the provider
 * keys server-side. The extension then stores no API key at all.
 */
export class CloudGatewayProvider extends BaseAIProvider {
  readonly id: AIProviderId = 'cloud';
  readonly label = 'JobPilot Cloud';
  readonly defaultBaseUrl = '';
  readonly suggestedModels: string[] = [];

  async chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse> {
    const baseUrl = credentials.baseUrl.replace(/\/$/, '');
    if (!baseUrl) {
      throw new JobPilotError(
        ERROR_CODES.AI_NOT_CONFIGURED,
        'Cloud mode is selected but no gateway endpoint is configured.',
        { hint: 'Add the endpoint in Settings → AI provider, or switch to Local mode.' },
      );
    }
    const data = await postJson<CloudResponse>({
      url: `${baseUrl}/v1/chat`,
      headers: credentials.apiKey ? { authorization: `Bearer ${credentials.apiKey}` } : {},
      body: {
        model: credentials.model,
        messages: request.messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        json: request.json,
      },
      timeoutMs: request.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
      providerLabel: this.label,
    });
    return {
      text: data.text ?? '',
      promptTokens: data.usage?.promptTokens ?? null,
      completionTokens: data.usage?.completionTokens ?? null,
      model: data.model ?? credentials.model,
    };
  }
}

export const cloudProvider = new CloudGatewayProvider();
