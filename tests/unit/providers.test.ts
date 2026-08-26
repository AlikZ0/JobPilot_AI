import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_IDS } from '@/types/ai';
import { getProvider, listProviders, PROVIDERS } from '@/providers/registry';

describe('реестр AI-провайдеров', () => {
  it('покрывает все объявленные идентификаторы', () => {
    for (const id of AI_PROVIDER_IDS) {
      expect(PROVIDERS[id], `нет провайдера для «${id}»`).toBeDefined();
      expect(getProvider(id).id).toBe(id);
    }
    expect(listProviders()).toHaveLength(AI_PROVIDER_IDS.length);
  });

  it('у каждого есть подпись и рабочая ссылка на выдачу ключа', () => {
    for (const provider of listProviders()) {
      expect(provider.label.trim().length, provider.id).toBeGreaterThan(0);
      // Пусто допустимо там, где ключа нет вовсе: свой сервер и облачный шлюз.
      if (provider.apiKeyUrl) {
        expect(() => new URL(provider.apiKeyUrl), provider.id).not.toThrow();
        expect(provider.apiKeyUrl.startsWith('https://'), provider.id).toBe(true);
      } else {
        expect(['custom', 'cloud']).toContain(provider.id);
      }
    }
  });

  it('базовый адрес задан у всех, кроме тех, где его вводит пользователь', () => {
    for (const provider of listProviders()) {
      if (provider.defaultBaseUrl) {
        expect(() => new URL(provider.defaultBaseUrl), provider.id).not.toThrow();
      } else {
        expect(['custom', 'cloud']).toContain(provider.id);
      }
    }
  });

  it('бесплатный тариф отмечен там, где он есть', () => {
    const free = listProviders()
      .filter((provider) => provider.freeTier)
      .map((provider) => provider.id)
      .sort();
    expect(free).toEqual(['gemini', 'groq', 'openrouter', 'qwen', 'zhipu']);
  });

  it('идентификаторы моделей не повторяются внутри одного провайдера', () => {
    for (const provider of listProviders()) {
      expect(new Set(provider.suggestedModels).size, provider.id).toBe(
        provider.suggestedModels.length,
      );
    }
  });
});
