import type { Envelope, MessageType, PayloadOf, Response, ResultOf } from '@/types/messages';
import { JobPilotError, ERROR_CODES, toSerializedError } from './errors';
import { nextRequestId } from './id';

/** Собирает типизированный конверт. Вызывающий код не создаёт сырые объекты. */
export function msg<T extends MessageType>(type: T, payload: PayloadOf<T>): Envelope<T> {
  return { type, payload, requestId: nextRequestId() };
}

function unwrap<R>(response: Response<R> | undefined): R {
  if (!response) {
    throw new JobPilotError(ERROR_CODES.UNKNOWN, 'Фоновый воркер расширения не ответил.', {
      hint: 'Перезагрузите расширение на chrome://extensions и повторите попытку.',
    });
  }
  if (response.ok) return response.data;
  throw new JobPilotError(response.error.code as never, response.error.message, {
    hint: response.error.hint,
    recoverable: response.error.recoverable,
  });
}

/** Боковая панель / попап / content-скрипт -> фоновый воркер. */
export async function sendToBackground<T extends MessageType>(
  type: T,
  payload: PayloadOf<T>,
): Promise<ResultOf<T>> {
  const response = (await chrome.runtime.sendMessage(msg(type, payload))) as
    Response<ResultOf<T>> | undefined;
  return unwrap(response);
}

/** Фоновый воркер -> content-скрипт конкретной вкладки. */
export async function sendToTab<T extends MessageType>(
  tabId: number,
  type: T,
  payload: PayloadOf<T>,
): Promise<ResultOf<T>> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, msg(type, payload))) as
      Response<ResultOf<T>> | undefined;
    return unwrap(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
      throw new JobPilotError(
        ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        'Content-скрипт JobPilot не запущен в этой вкладке.',
      );
    }
    throw error;
  }
}

/** Широковещательная рассылка страницам расширения (панель, попап) без ожидания ответа. */
export function broadcast<T extends MessageType>(type: T, payload: PayloadOf<T>): void {
  // Отсутствие получателя — нормальная ситуация (панель закрыта): гасим отказ.
  void chrome.runtime.sendMessage(msg(type, payload)).catch(() => undefined);
}

export type Handler<T extends MessageType> = (
  payload: PayloadOf<T>,
  sender: chrome.runtime.MessageSender,
) => Promise<ResultOf<T>> | ResultOf<T>;

export type HandlerMap = { [T in MessageType]?: Handler<T> };

/**
 * Регистрирует слушателя сообщений: находит обработчик в типизированной карте
 * и превращает выброшенные исключения в сериализованные ответы.
 */
export function registerMessageHandlers(handlers: HandlerMap): void {
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const envelope = raw as Envelope | undefined;
    if (!envelope || typeof envelope.type !== 'string') return false;
    const handler = handlers[envelope.type] as Handler<MessageType> | undefined;
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(envelope.payload as never, sender))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: toSerializedError(error) }));
    return true; // держим канал открытым для асинхронного ответа
  });
}
