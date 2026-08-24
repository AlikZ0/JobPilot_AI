import type { EmploymentType, Seniority, WorkMode } from '@/types/profile';
import type { SalaryRange } from '@/types/job';
import { normalizeWhitespace, parseNumber } from '@/utils/text';

export type MaybeSeniority = Seniority | 'unknown';
export type MaybeWorkMode = WorkMode | 'unknown';
export type MaybeEmployment = EmploymentType | 'unknown';

const SENIORITY_PATTERNS: [MaybeSeniority, RegExp][] = [
  ['intern', /\b(intern|internship|trainee|stажер|стажер|стажёр)\b/i],
  ['junior', /\b(junior|jr\.?|entry[- ]level|graduate|джуниор|начинающий)\b/i],
  ['principal', /\b(principal|staff engineer|architect|архитектор)\b/i],
  ['director', /\b(director|head of|vp of|cto|engineering manager)\b/i],
  ['lead', /\b(lead|team ?lead|tech ?lead|тимлид|техлид)\b/i],
  ['senior', /\b(senior|sr\.?|сеньор|синьор)\b/i],
  ['mid', /\b(middle|mid[- ]level|regular|мидл)\b/i],
];

export function detectSeniority(text: string): MaybeSeniority {
  for (const [level, pattern] of SENIORITY_PATTERNS) {
    if (pattern.test(text)) return level;
  }
  return 'unknown';
}

export function detectWorkMode(text: string): MaybeWorkMode {
  if (/\b(hybrid|гибрид)\b/i.test(text)) return 'hybrid';
  if (
    /\b(fully remote|100% remote|remote[- ]first|remote|удал[её]нн?о|work from home|wfh|anywhere)\b/i.test(
      text,
    )
  ) {
    return 'remote';
  }
  if (/\b(on[- ]?site|in[- ]office|office[- ]based|офис)\b/i.test(text)) return 'office';
  return 'unknown';
}

export function detectEmploymentType(text: string): MaybeEmployment {
  if (/\b(intern(ship)?)\b/i.test(text)) return 'internship';
  if (/\b(part[- ]time|部分)\b/i.test(text)) return 'part_time';
  if (/\b(freelance|freelancer)\b/i.test(text)) return 'freelance';
  if (/\b(contract|contractor|b2b|c2c|outstaff)\b/i.test(text)) return 'contract';
  if (/\b(temporary|temp|seasonal)\b/i.test(text)) return 'temporary';
  if (/\b(full[- ]time|permanent|полная занятость)\b/i.test(text)) return 'full_time';
  return 'unknown';
}

/** Maps schema.org employmentType values onto our enum. */
export function employmentTypeFromSchema(value: string): MaybeEmployment {
  const v = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (v.includes('FULLTIME')) return 'full_time';
  if (v.includes('PARTTIME')) return 'part_time';
  if (v.includes('CONTRACTOR') || v.includes('CONTRACT')) return 'contract';
  if (v.includes('INTERN')) return 'internship';
  if (v.includes('TEMPORARY')) return 'temporary';
  if (v.includes('VOLUNTEER') || v.includes('PERDIEM')) return 'temporary';
  return 'unknown';
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₴': 'UAH',
  '₽': 'RUB',
  '₸': 'KZT',
  '₾': 'GEL',
  '₹': 'INR',
  zł: 'PLN',
  Kč: 'CZK',
};

const PERIOD_PATTERNS: [SalaryRange['period'], RegExp][] = [
  ['hour', /\b(per hour|hourly|\/\s*h(our|r)?|в час)\b/i],
  ['day', /\b(per day|daily|\/\s*day|в день)\b/i],
  ['week', /\b(per week|weekly|\/\s*week)\b/i],
  ['month', /\b(per month|monthly|\/\s*mo(nth)?|в месяц|net\/month|gross\/month)\b/i],
  ['year', /\b(per year|per annum|annually|yearly|\/\s*(yr|year)|p\.a\.|в год)\b/i],
];

export const EMPTY_SALARY: SalaryRange = {
  min: null,
  max: null,
  currency: '',
  period: 'unknown',
  raw: '',
};

/**
 * Parses salary strings such as "$3,000 – $4,000 per month", "80k–100k USD/yr"
 * or "від 2000 до 3000 €". Returns nulls rather than guessing when unclear.
 */
export function parseSalary(input: string): SalaryRange {
  const raw = normalizeWhitespace(input);
  if (!raw) return { ...EMPTY_SALARY };

  let currency = '';
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(symbol)) {
      currency = code;
      break;
    }
  }
  if (!currency) {
    const code = raw.match(
      /\b(USD|EUR|GBP|PLN|UAH|CZK|CHF|SEK|NOK|DKK|CAD|AUD|INR|KZT|GEL|RUB|TRY|BRL|ILS|AED|JPY|CNY)\b/i,
    );
    if (code) currency = code[1]!.toUpperCase();
  }

  let period: SalaryRange['period'] = 'unknown';
  for (const [candidate, pattern] of PERIOD_PATTERNS) {
    if (pattern.test(raw)) {
      period = candidate;
      break;
    }
  }

  const numbers: number[] = [];
  const numberRe = /(\d[\d\s.,]{0,12})\s*(k|тыс|thousand)?/gi;
  let match: RegExpExecArray | null;
  while ((match = numberRe.exec(raw)) !== null) {
    const value = parseNumber(match[1] ?? '');
    if (value === null) continue;
    const multiplier = match[2] ? 1000 : 1;
    const scaled = value * multiplier;
    // Ignore obvious non-salary numbers such as years ("2024") or "40 hours".
    if (scaled < 3 || scaled > 100_000_000) continue;
    numbers.push(scaled);
  }

  if (numbers.length === 0) return { ...EMPTY_SALARY, currency, period, raw };
  const sorted = [...numbers].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted.length > 1 ? sorted[sorted.length - 1]! : null;

  if (period === 'unknown') {
    // Infer a period from magnitude when the ad omits it.
    const reference = max ?? min;
    if (reference >= 20_000) period = 'year';
    else if (reference >= 500) period = 'month';
    else if (reference <= 200) period = 'hour';
  }

  return { min, max: max === min ? null : max, currency, period, raw };
}

const PERIOD_TO_MONTHLY: Record<Exclude<SalaryRange['period'], 'unknown'>, number> = {
  hour: 160,
  day: 21,
  week: 4.33,
  month: 1,
  year: 1 / 12,
};

/** Converts a salary figure to a monthly figure for comparison. */
export function toMonthly(amount: number, period: SalaryRange['period']): number | null {
  if (period === 'unknown') return null;
  return amount * PERIOD_TO_MONTHLY[period];
}

const LANGUAGE_PATTERNS: [string, RegExp][] = [
  ['English', /\benglish|английск/i],
  ['German', /\bgerman|deutsch|немецк/i],
  ['French', /\bfrench|français|французск/i],
  ['Spanish', /\bspanish|español|испанск/i],
  ['Polish', /\bpolish|polski|польск/i],
  ['Ukrainian', /\bukrainian|українськ|украинск/i],
  ['Russian', /\brussian|русск/i],
  ['Dutch', /\bdutch|nederlands/i],
  ['Portuguese', /\bportuguese|português/i],
  ['Italian', /\bitalian|italiano/i],
  ['Hebrew', /\bhebrew|иврит/i],
  ['Arabic', /\barabic/i],
  ['Chinese', /\bchinese|mandarin/i],
  ['Japanese', /\bjapanese/i],
];

/** Detects language requirements such as "English B2" or "fluent German". */
export function detectLanguageRequirements(text: string): string[] {
  const out: string[] = [];
  for (const [language, pattern] of LANGUAGE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const window = text.slice(Math.max(0, match.index - 60), match.index + 90);
    const level = window.match(
      /\b([ABC][12])\b|\b(native|fluent|advanced|upper[- ]intermediate|intermediate|conversational|basic)\b/i,
    );
    out.push(level ? `${language} ${level[0]}` : language);
  }
  return out;
}

const CEFR_ORDER = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'native'];

/** Maps loose descriptions ("fluent", "advanced") onto a CEFR index. */
export function languageLevelIndex(value: string): number {
  const v = value.toLowerCase();
  const cefr = v.match(/\b([abc][12])\b/);
  if (cefr) return CEFR_ORDER.indexOf(cefr[1]!);
  if (/native|mother tongue/.test(v)) return 6;
  if (/fluent|proficient|c2/.test(v)) return 5;
  if (/advanced|c1/.test(v)) return 4;
  if (/upper[- ]intermediate|b2/.test(v)) return 3;
  if (/intermediate|conversational|b1/.test(v)) return 2;
  if (/pre[- ]intermediate|elementary|a2/.test(v)) return 1;
  if (/basic|beginner|a1/.test(v)) return 0;
  return -1;
}

export function splitLocation(location: string): { city: string; country: string } {
  const parts = normalizeWhitespace(location)
    .split(/[,|·•]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { city: '', country: '' };
  if (parts.length === 1) return { city: '', country: parts[0]! };
  return { city: parts[0]!, country: parts[parts.length - 1]! };
}
