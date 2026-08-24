/**
 * Logging with mandatory redaction. Email addresses, phone numbers and
 * anything that looks like an API key never reach the console (docs/privacy.md).
 */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const KEY_RE = /\b(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (typeof value === 'string') {
    return value
      .replace(EMAIL_RE, '[email]')
      .replace(KEY_RE, '[secret]')
      .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 8 ? '[phone]' : m));
  }
  if (Array.isArray(value)) return value.slice(0, 25).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/key|token|secret|password|authorization|apikey/i.test(k)) {
        out[k] = '[redacted]';
      } else if (/email|phone|firstname|lastname|dataurl/i.test(k)) {
        out[k] = '[pii]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: LogLevel = import.meta.env?.DEV ? 'debug' : 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function createLogger(scope: string) {
  const emit = (level: LogLevel, message: string, data?: unknown) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const prefix = `[jobpilot:${scope}]`;
    const payload = data === undefined ? [] : [redact(data)];
    // eslint-disable-next-line no-console
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(prefix, message, ...payload);
  };
  return {
    debug: (m: string, d?: unknown) => emit('debug', m, d),
    info: (m: string, d?: unknown) => emit('info', m, d),
    warn: (m: string, d?: unknown) => emit('warn', m, d),
    error: (m: string, d?: unknown) => emit('error', m, d),
  };
}
