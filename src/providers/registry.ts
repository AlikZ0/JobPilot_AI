import type { AIProviderId } from '@/types/ai';
import type { AIProvider } from '@/core/ai/types';
import { anthropicProvider } from './anthropic';
import { cloudProvider } from './cloud';
import {
  deepseekProvider,
  groqProvider,
  moonshotProvider,
  qwenProvider,
  xaiProvider,
  zhipuProvider,
} from './compatible';
import { geminiProvider } from './gemini';
import { customProvider, openaiProvider } from './openai';
import { openrouterProvider } from './openrouter';

export const PROVIDERS: Record<AIProviderId, AIProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  xai: xaiProvider,
  groq: groqProvider,
  deepseek: deepseekProvider,
  zhipu: zhipuProvider,
  moonshot: moonshotProvider,
  qwen: qwenProvider,
  openrouter: openrouterProvider,
  custom: customProvider,
  cloud: cloudProvider,
};

export function getProvider(id: AIProviderId): AIProvider {
  return PROVIDERS[id] ?? openaiProvider;
}

export function listProviders(): AIProvider[] {
  return Object.values(PROVIDERS);
}
