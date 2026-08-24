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

describe('log redaction', () => {
  it('removes emails, phones and keys from strings', () => {
    const redacted = redact('contact alex@example.com or +1 555 0100 with sk-abcdef123456');
    expect(redacted).not.toContain('alex@example.com');
    expect(redacted).not.toContain('sk-abcdef123456');
    expect(String(redacted)).toContain('[email]');
  });

  it('masks sensitive object keys', () => {
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

  it('does not blow up on deep structures', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'x' } } } } } };
    expect(() => redact(deep)).not.toThrow();
  });

  it('logs through the redacting logger', () => {
    const logger = createLogger('test');
    expect(() => logger.info('hello', { apiKey: 'sk-1' })).not.toThrow();
  });
});

describe('API key storage', () => {
  it('stores and reads a key per provider', async () => {
    await setApiKey('openai', 'sk-test');
    expect(await getApiKey('openai')).toBe('sk-test');
    expect(await hasApiKey('anthropic')).toBe(false);
    expect(await listConfiguredProviders()).toEqual(['openai']);
  });

  it('moves keys when the storage mode changes', async () => {
    await setApiKey('openai', 'sk-move');
    await setKeyStorageMode('session');
    expect(await getApiKey('openai')).toBe('sk-move');
    await setKeyStorageMode('local');
    expect(await getApiKey('openai')).toBe('sk-move');
  });

  it('clears every key', async () => {
    await setApiKey('openai', 'sk-a');
    await setApiKey('gemini', 'sk-b');
    await clearApiKeys();
    expect(await listConfiguredProviders()).toEqual([]);
  });

  it('masks keys for display', () => {
    expect(maskKey('sk-1234567890')).toBe('sk-…7890');
    expect(maskKey('')).toBe('');
  });
});

describe('URL guards', () => {
  it('blocks browser-internal pages', () => {
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('https://chromewebstore.google.com/x')).toBe(true);
    expect(isRestrictedUrl('https://linkedin.com/jobs')).toBe(false);
  });

  it('builds origin patterns for permission requests', () => {
    expect(originPattern('https://www.linkedin.com/jobs/view/1')).toBe(
      'https://www.linkedin.com/*',
    );
    expect(originPattern('chrome://x')).toBeNull();
  });

  it('normalises URLs deterministically', () => {
    expect(normalizeUrl('https://x.test/a/?b=2&a=1')).toBe(
      normalizeUrl('https://x.test/a?a=1&b=2'),
    );
  });
});

describe('errors', () => {
  it('serialises with a code and a friendly hint', () => {
    const error = new JobPilotError(ERROR_CODES.AI_NOT_CONFIGURED, 'no key');
    const serialized = toSerializedError(error);
    expect(serialized.code).toBe('ai_not_configured');
    expect(describeError(serialized)).toMatch(/Settings/);
  });

  it('wraps unknown throwables', () => {
    expect(toSerializedError('boom').code).toBe('unknown');
  });
});

describe('source-level security rules', () => {
  const sourceFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) sourceFiles.push(full);
    }
  };
  walk('src');

  it('never uses eval or the Function constructor', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\beval\s*\(/);
      expect(source, file).not.toMatch(/new\s+Function\s*\(/);
    }
  });

  it('never assigns innerHTML', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\.innerHTML\s*=/);
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('keeps API key access out of content scripts and UI pages', () => {
    for (const file of sourceFiles) {
      if (!/^src[/\\](content|sidepanel|popup)/.test(file)) continue;
      // The settings page writes keys but must never read them back.
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\bgetApiKey\s*\(/);
    }
  });

  it('never calls form.submit() or clicks submit controls', () => {
    for (const file of sourceFiles) {
      // Comments may mention the rule; only real code is checked.
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source, file).not.toMatch(/\.submit\s*\(\s*\)/);
      expect(source, file).not.toMatch(/requestSubmit\s*\(/);
      expect(source, file).not.toMatch(/\[type=["']submit["']\][^\n]*\.click\(/);
    }
  });
});
