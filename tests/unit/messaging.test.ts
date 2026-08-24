import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MESSAGE_TYPES } from '@/types/messages';
import {
  broadcast,
  msg,
  registerMessageHandlers,
  sendToBackground,
  sendToTab,
} from '@/utils/messaging';
import { ERROR_CODES } from '@/utils/errors';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('конверты сообщений', () => {
  it('несут тип, полезную нагрузку и id запроса', () => {
    const envelope = msg(MESSAGE_TYPES.CONTENT_EXTRACT_JOB, { maxDescriptionChars: 100 });
    expect(envelope.type).toBe('content_extract_job');
    expect(envelope.payload).toEqual({ maxDescriptionChars: 100 });
    expect(envelope.requestId).toMatch(/^r/);
  });

  it('все объявленные типы уникальны', () => {
    const values = Object.values(MESSAGE_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('sendToBackground', () => {
  it('разворачивает успешный ответ', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({
      ok: true,
      data: { ok: true, version: '0.1.0' },
    } as never);
    const result = await sendToBackground(MESSAGE_TYPES.PING, undefined);
    expect(result.version).toBe('0.1.0');
  });

  it('пробрасывает сериализованную ошибку с её кодом', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({
      ok: false,
      error: { code: ERROR_CODES.AI_NOT_CONFIGURED, message: 'no key', recoverable: true },
    } as never);
    await expect(sendToBackground(MESSAGE_TYPES.PING, undefined)).rejects.toMatchObject({
      code: 'ai_not_configured',
    });
  });

  it('понятно сообщает, что фоновый воркер не ответил', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined as never);
    await expect(sendToBackground(MESSAGE_TYPES.PING, undefined)).rejects.toThrow(/не ответил/);
  });
});

describe('sendToTab', () => {
  it('превращает отсутствие content-скрипта в типизированную ошибку', async () => {
    vi.spyOn(chrome.tabs, 'sendMessage').mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    await expect(sendToTab(1, MESSAGE_TYPES.CONTENT_PING, undefined)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
    });
  });
});

describe('регистрация обработчиков', () => {
  it('отвечает на зарегистрированный тип и игнорирует прочие', async () => {
    const listeners: ((...args: unknown[]) => unknown)[] = [];
    vi.spyOn(chrome.runtime.onMessage, 'addListener').mockImplementation((listener) => {
      listeners.push(listener as never);
    });
    registerMessageHandlers({
      [MESSAGE_TYPES.CONTENT_PING]: () => ({ ok: true as const }),
    });

    const listener = listeners[0]!;
    const respond = vi.fn();
    const handled = listener(msg(MESSAGE_TYPES.CONTENT_PING, undefined), {}, respond);
    expect(handled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(respond).toHaveBeenCalledWith({ ok: true, data: { ok: true } });

    const ignored = listener(msg(MESSAGE_TYPES.PING, undefined), {}, respond);
    expect(ignored).toBe(false);
  });

  it('сериализует выброшенную ошибку в ответ', async () => {
    const listeners: ((...args: unknown[]) => unknown)[] = [];
    vi.spyOn(chrome.runtime.onMessage, 'addListener').mockImplementation((listener) => {
      listeners.push(listener as never);
    });
    registerMessageHandlers({
      [MESSAGE_TYPES.CONTENT_PING]: () => {
        throw new Error('boom');
      },
    });
    const respond = vi.fn();
    listeners[0]!(msg(MESSAGE_TYPES.CONTENT_PING, undefined), {}, respond);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(respond).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ message: 'boom' }),
    });
  });
});

describe('широковещательная рассылка', () => {
  it('не падает, когда получателя нет', () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockRejectedValue(new Error('no receiver'));
    expect(() =>
      broadcast(MESSAGE_TYPES.EVENT_TOAST, { level: 'info', message: 'x' }),
    ).not.toThrow();
  });
});
