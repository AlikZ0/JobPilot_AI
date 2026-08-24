/** Text helpers shared by extraction, scoring and form mapping. */

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim();
}

/** Truncates on a word boundary and appends an ellipsis marker. */
export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const cut = value.slice(0, maxChars);
  const lastBreak = cut.lastIndexOf(' ');
  return `${(lastBreak > maxChars * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd()}…`;
}

export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n+/)
    .map((line) => normalizeWhitespace(line.replace(/^[\s•▪◦·*\-–—]+/, '')))
    .filter((line) => line.length > 1);
}

export function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const k = key(value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(value);
  }
  return out;
}

/**
 * Parses a human-written number: "3", "3.5", "3,5", "$3 000", "4,500".
 * A separator followed by exactly three digits is treated as a thousands
 * separator, which is what salary strings almost always mean.
 */
export function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma !== -1 && lastDot !== -1) {
    // The right-most separator is the decimal one; the other groups thousands.
    const decimalAt = Math.max(lastComma, lastDot);
    const decimalChar = cleaned[decimalAt];
    const groupChar = decimalChar === ',' ? '.' : ',';
    normalized = cleaned.split(groupChar).join('').replace(',', '.');
  } else if (lastComma !== -1 || lastDot !== -1) {
    const at = Math.max(lastComma, lastDot);
    const tail = cleaned.slice(at + 1);
    const groupedThousands = /^\d{3}$/.test(tail);
    normalized = groupedThousands
      ? cleaned.replace(/[.,]/g, '')
      : cleaned.replace(/[.,](?=.*[.,])/g, '').replace(',', '.');
  } else {
    normalized = cleaned;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Jaccard similarity over word sets — used for duplicate detection. */
export function similarity(a: string, b: string): number {
  const wa = new Set(normalizeToken(a).split(' ').filter(Boolean));
  const wb = new Set(normalizeToken(b).split(' ').filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let intersection = 0;
  for (const w of wa) if (wb.has(w)) intersection++;
  return intersection / (wa.size + wb.size - intersection);
}
