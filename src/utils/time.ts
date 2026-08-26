export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isToday(timestamp: number, now = Date.now()): boolean {
  return startOfDay(timestamp) === startOfDay(now);
}

export function formatRelative(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE_MS) return 'только что';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} мин назад`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} ч назад`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)} дн назад`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Сколько осталось до момента в будущем. `formatRelative` для этого не годится:
 * у неё отрицательная разница попадает в «только что», и срок напоминания,
 * поставленный на три дня вперёд, выглядел как уже наступивший.
 */
export function formatUntil(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now;
  if (diff <= 0) return 'пора';
  if (diff < HOUR_MS) return `через ${Math.max(1, Math.floor(diff / MINUTE_MS))} мин`;
  if (diff < DAY_MS) return `через ${Math.floor(diff / HOUR_MS)} ч`;
  return `через ${Math.ceil(diff / DAY_MS)} дн`;
}

export function formatDateTime(timestamp: number): string {
  // Локаль берётся из браузера, но без секунд: в интерфейсе они только шумят.
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
