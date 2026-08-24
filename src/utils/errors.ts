import type { SerializedError } from '@/types/messages';

export const ERROR_CODES = {
  AI_NOT_CONFIGURED: 'ai_not_configured',
  AI_DISABLED: 'ai_disabled',
  AI_REQUEST_FAILED: 'ai_request_failed',
  AI_INVALID_RESPONSE: 'ai_invalid_response',
  AI_RATE_LIMITED: 'ai_rate_limited',
  AI_AUTH_FAILED: 'ai_auth_failed',
  AI_TIMEOUT: 'ai_timeout',
  AI_BUDGET_EXCEEDED: 'ai_budget_exceeded',
  EXTRACTION_FAILED: 'extraction_failed',
  NO_JOB_ON_PAGE: 'no_job_on_page',
  NO_FORM_ON_PAGE: 'no_form_on_page',
  CONTENT_SCRIPT_UNAVAILABLE: 'content_script_unavailable',
  PERMISSION_DENIED: 'permission_denied',
  NO_ACTIVE_TAB: 'no_active_tab',
  RESTRICTED_PAGE: 'restricted_page',
  NOT_FOUND: 'not_found',
  PROFILE_INCOMPLETE: 'profile_incomplete',
  SCAN_ALREADY_RUNNING: 'scan_already_running',
  VALIDATION_FAILED: 'validation_failed',
  UNKNOWN: 'unknown',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Ошибка приложения со стабильным кодом и подсказкой для пользователя. */
export class JobPilotError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly recoverable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { hint?: string; recoverable?: boolean },
  ) {
    super(message);
    this.name = 'JobPilotError';
    this.code = code;
    this.hint = options?.hint;
    this.recoverable = options?.recoverable ?? true;
  }

  toJSON(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      ...(this.hint ? { hint: this.hint } : {}),
      recoverable: this.recoverable,
    };
  }
}

export function toSerializedError(error: unknown): SerializedError {
  if (error instanceof JobPilotError) return error.toJSON();
  if (error instanceof Error) {
    return { code: ERROR_CODES.UNKNOWN, message: error.message, recoverable: true };
  }
  return { code: ERROR_CODES.UNKNOWN, message: String(error), recoverable: true };
}

const FRIENDLY: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.AI_NOT_CONFIGURED]:
    'AI-провайдер не настроен. Добавьте провайдера и API-ключ в настройках.',
  [ERROR_CODES.AI_DISABLED]: 'Запросы к AI выключены. Включите их в «Настройки → Приватность».',
  [ERROR_CODES.AI_AUTH_FAILED]: 'AI-провайдер отклонил API-ключ. Проверьте его в настройках.',
  [ERROR_CODES.AI_RATE_LIMITED]:
    'AI-провайдер ограничивает частоту запросов. Повторите чуть позже.',
  [ERROR_CODES.AI_TIMEOUT]: 'AI-провайдер не ответил вовремя.',
  [ERROR_CODES.AI_BUDGET_EXCEEDED]:
    'Достигнут дневной лимит запросов к AI. Увеличьте его в «Настройки → Контроль расходов».',
  [ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE]:
    'JobPilot не может прочитать эту вкладку. Перезагрузите страницу или выдайте доступ к сайту.',
  [ERROR_CODES.PERMISSION_DENIED]: 'Доступ к сайту не выдан, поэтому страницу нельзя прочитать.',
  [ERROR_CODES.RESTRICTED_PAGE]: 'Chrome не разрешает расширениям работать на этой странице.',
  [ERROR_CODES.NO_JOB_ON_PAGE]: 'На этой странице не найдено вакансии.',
  [ERROR_CODES.NO_FORM_ON_PAGE]: 'На этой странице не найдено формы заявки.',
  [ERROR_CODES.PROFILE_INCOMPLETE]:
    'Сначала заполните профиль, чтобы можно было считать совпадение.',
};

export function describeError(error: SerializedError): string {
  return error.hint ?? FRIENDLY[error.code as ErrorCode] ?? error.message;
}
