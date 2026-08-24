import { JobPilotError, ERROR_CODES } from '@/utils/errors';

export interface HttpJsonOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  providerLabel: string;
}

/**
 * Single HTTP entry point for every provider so timeouts, aborts and error
 * mapping behave identically. Requests are only ever made from the extension
 * service worker — never from a content script (docs/security.md).
 */
export async function postJson<T>(options: HttpJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await safeText(response);
      throw mapHttpError(response.status, detail, options.providerLabel);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof JobPilotError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new JobPilotError(
        ERROR_CODES.AI_TIMEOUT,
        `${options.providerLabel} did not respond within ${Math.round(options.timeoutMs / 1000)}s.`,
      );
    }
    throw new JobPilotError(
      ERROR_CODES.AI_REQUEST_FAILED,
      `Could not reach ${options.providerLabel}: ${error instanceof Error ? error.message : String(error)}`,
      { hint: 'Check your connection and the base URL in Settings.' },
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 400);
  } catch {
    return '';
  }
}

function mapHttpError(status: number, detail: string, provider: string): JobPilotError {
  if (status === 401 || status === 403) {
    return new JobPilotError(ERROR_CODES.AI_AUTH_FAILED, `${provider} rejected the API key.`, {
      hint: 'Open Settings → AI provider and re-enter your key.',
    });
  }
  if (status === 429) {
    return new JobPilotError(
      ERROR_CODES.AI_RATE_LIMITED,
      `${provider} is rate limiting requests.`,
      {
        hint: 'Wait a moment, or lower the scan concurrency in Settings.',
      },
    );
  }
  if (status >= 500) {
    return new JobPilotError(
      ERROR_CODES.AI_REQUEST_FAILED,
      `${provider} returned a server error (${status}).`,
    );
  }
  return new JobPilotError(
    ERROR_CODES.AI_REQUEST_FAILED,
    `${provider} returned ${status}: ${detail || 'no details'}`,
  );
}
