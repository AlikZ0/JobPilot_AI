/** Collision-resistant id that works in every extension context. */
export function createId(prefix = ''): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${random}` : random;
}

let counter = 0;
export function nextRequestId(): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `r${Date.now().toString(36)}${counter.toString(36)}`;
}
