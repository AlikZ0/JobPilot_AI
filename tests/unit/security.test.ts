import { describe, expect, it, beforeEach } from 'vitest';
import { redact, createLogger } from '@/utils/logger';
import {
  clearApiKeys,
  getApiKey,
  hasApiKey,
  listConfiguredProviders,
  maskKey,
  setApiKey,
  setKeyStorageMode,
} from '@/core/ai/keyStore';
import { isRestrictedUrl, originPattern, normalizeUrl } from '@/utils/url';
import { JobPilotError, ERROR_CODES, describeError, toSerializedError } from '@/utils/errors';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

beforeEach(async () => {
  await clearApiKeys();
});

describe('маскировка в логах', () => {
  it('убирает почту, телефоны и ключи из строк', () => {
    const redacted = redact('contact alex@example.com or +1 555 0100 with sk-abcdef123456');
    expect(redacted).not.toContain('alex@example.com');
    expect(redacted).not.toContain('sk-abcdef123456');
    expect(String(redacted)).toContain('[email]');
  });

  it('маскирует чувствительные поля объектов', () => {
    const redacted = redact({
      apiKey: 'sk-secret',
      authorization: 'Bearer abc',
      personal: { email: 'a@b.com', firstName: 'Alex' },
      safe: 'value',
    }) as Record<string, unknown>;
    expect(redacted.apiKey).toBe('[redacted]');
    expect(redacted.authorization).toBe('[redacted]');
    expect((redacted.personal as Record<string, unknown>).email).toBe('[pii]');
    expect(redacted.safe).toBe('value');
  });

  it('не падает на глубоко вложенных структурах', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'x' } } } } } };
    expect(() => redact(deep)).not.toThrow();
  });

  it('пишет через логгер с маскировкой', () => {
    const logger = createLogger('test');
    expect(() => logger.info('hello', { apiKey: 'sk-1' })).not.toThrow();
  });
});

describe('хранение API-ключей', () => {
  it('хранит и читает ключ по провайдеру', async () => {
    await setApiKey('openai', 'sk-test');
    expect(await getApiKey('openai')).toBe('sk-test');
    expect(await hasApiKey('anthropic')).toBe(false);
    expect(await listConfiguredProviders()).toEqual(['openai']);
  });

  it('переносит ключи при смене режима хранения', async () => {
    await setApiKey('openai', 'sk-move');
    await setKeyStorageMode('session');
    expect(await getApiKey('openai')).toBe('sk-move');
    await setKeyStorageMode('local');
    expect(await getApiKey('openai')).toBe('sk-move');
  });

  it('удаляет все ключи', async () => {
    await setApiKey('openai', 'sk-a');
    await setApiKey('gemini', 'sk-b');
    await clearApiKeys();
    expect(await listConfiguredProviders()).toEqual([]);
  });

  it('маскирует ключ для показа', () => {
    expect(maskKey('sk-1234567890')).toBe('sk-…7890');
    expect(maskKey('')).toBe('');
  });
});

describe('защита по URL', () => {
  it('блокирует служебные страницы браузера', () => {
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('https://chromewebstore.google.com/x')).toBe(true);
    expect(isRestrictedUrl('https://linkedin.com/jobs')).toBe(false);
  });

  it('строит шаблоны origin для запроса разрешений', () => {
    expect(originPattern('https://www.linkedin.com/jobs/view/1')).toBe(
      'https://www.linkedin.com/*',
    );
    expect(originPattern('chrome://x')).toBeNull();
  });

  it('нормализует URL детерминированно', () => {
    expect(normalizeUrl('https://x.test/a/?b=2&a=1')).toBe(
      normalizeUrl('https://x.test/a?a=1&b=2'),
    );
  });
});

describe('ошибки', () => {
  it('сериализуются с кодом и понятной подсказкой', () => {
    const error = new JobPilotError(ERROR_CODES.AI_NOT_CONFIGURED, 'no key');
    const serialized = toSerializedError(error);
    expect(serialized.code).toBe('ai_not_configured');
    expect(describeError(serialized)).toMatch(/настройках/);
  });

  it('оборачивают неизвестные исключения', () => {
    expect(toSerializedError('boom').code).toBe('unknown');
  });
});

describe('правила безопасности на уровне исходников', () => {
  const sourceFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) sourceFiles.push(full);
    }
  };
  walk('src');

  it('нигде нет eval и конструктора Function', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\beval\s*\(/);
      expect(source, file).not.toMatch(/new\s+Function\s*\(/);
    }
  });

  it('нигде не присваивается innerHTML', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\.innerHTML\s*=/);
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('чтение API-ключа недоступно из content-скриптов и страниц UI', () => {
    for (const file of sourceFiles) {
      if (!/^src[/\\](content|sidepanel|popup)/.test(file)) continue;
      // Страница настроек записывает ключи, но не должна читать их обратно.
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\bgetApiKey\s*\(/);
    }
  });

  it('нигде не вызывается отправка формы и не кликаются кнопки отправки', () => {
    for (const file of sourceFiles) {
      // В комментариях правило упоминать можно; проверяем только реальный код.
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source, file).not.toMatch(/\.submit\s*\(\s*\)/);
      expect(source, file).not.toMatch(/requestSubmit\s*\(/);
      expect(source, file).not.toMatch(/\[type=["']submit["']\][^\n]*\.click\(/);
    }
  });
});
