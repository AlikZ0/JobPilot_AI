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

/** Application error carrying a stable code and a user-facing hint. */
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
    'No AI provider configured. Add a provider and API key in Settings.',
  [ERROR_CODES.AI_DISABLED]: 'AI requests are turned off. Enable them in Settings → Privacy.',
  [ERROR_CODES.AI_AUTH_FAILED]: 'The AI provider rejected the API key. Check it in Settings.',
  [ERROR_CODES.AI_RATE_LIMITED]: 'The AI provider is rate limiting requests. Try again shortly.',
  [ERROR_CODES.AI_TIMEOUT]: 'The AI provider did not respond in time.',
  [ERROR_CODES.AI_BUDGET_EXCEEDED]:
    'Daily AI request limit reached. Raise it in Settings → Cost control.',
  [ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE]:
    'JobPilot cannot read this tab. Reload the page, or grant access for this site.',
  [ERROR_CODES.PERMISSION_DENIED]: 'Site access was not granted, so this page cannot be read.',
  [ERROR_CODES.RESTRICTED_PAGE]: 'Chrome does not allow extensions to run on this page.',
  [ERROR_CODES.NO_JOB_ON_PAGE]: 'No job posting was found on this page.',
  [ERROR_CODES.NO_FORM_ON_PAGE]: 'No application form was found on this page.',
  [ERROR_CODES.PROFILE_INCOMPLETE]: 'Complete your profile first so matches can be scored.',
};

export function describeError(error: SerializedError): string {
  return error.hint ?? FRIENDLY[error.code as ErrorCode] ?? error.message;
}
