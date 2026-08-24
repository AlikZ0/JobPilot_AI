import { normalizeWhitespace } from '@/utils/text';
import { elementText } from './html';

/** Селекторы от самых специфичных к самым общим, применяются на всех сайтах. */
const TITLE_SELECTORS = [
  '[data-testid*="job-title" i]',
  '[data-test*="job-title" i]',
  '[class*="job-title" i]',
  '[class*="jobTitle" i]',
  '[class*="posting-headline" i] h2',
  'h1[class*="title" i]',
  'article h1',
  'main h1',
  'h1',
];

const COMPANY_SELECTORS = [
  '[data-testid*="company-name" i]',
  '[data-test*="company" i]',
  '[class*="company-name" i]',
  '[class*="companyName" i]',
  '[itemprop="hiringOrganization"]',
  'a[href*="/company/"]',
  '[class*="employer" i]',
];

const LOCATION_SELECTORS = [
  '[data-testid*="location" i]',
  '[data-test*="location" i]',
  '[class*="job-location" i]',
  '[class*="jobLocation" i]',
  '[itemprop="jobLocation"]',
  '[class*="location" i]',
];

const SALARY_SELECTORS = [
  '[data-testid*="salary" i]',
  '[class*="salary" i]',
  '[class*="compensation" i]',
  '[class*="pay" i]',
];

const DESCRIPTION_SELECTORS = [
  '[data-testid*="job-description" i]',
  '[class*="job-description" i]',
  '[class*="jobDescription" i]',
  '[class*="description" i][class*="content" i]',
  '[itemprop="description"]',
  'article',
  'main',
];

function firstText(root: ParentNode, selectors: string[], maxLength = 200): string {
  for (const selector of selectors) {
    let elements: Element[];
    try {
      elements = Array.from(root.querySelectorAll(selector));
    } catch {
      continue;
    }
    for (const element of elements) {
      const text = normalizeWhitespace(element.textContent ?? '');
      if (text.length >= 2 && text.length <= maxLength) return text;
    }
  }
  return '';
}

export function findTitle(root: ParentNode): string {
  return firstText(root, TITLE_SELECTORS, 160);
}

export function findCompany(root: ParentNode): string {
  return firstText(root, COMPANY_SELECTORS, 120);
}

export function findLocation(root: ParentNode): string {
  return firstText(root, LOCATION_SELECTORS, 120);
}

export function findSalary(root: ParentNode): string {
  const direct = firstText(root, SALARY_SELECTORS, 120);
  if (direct) return direct;
  // Запасной вариант: ищем сумму с валютой в видимом тексте.
  const text = normalizeWhitespace(root.textContent ?? '').slice(0, 20_000);
  const match = text.match(
    /(?:[$€£₴₽₸₹]|\b(?:USD|EUR|GBP|PLN|UAH|CZK|CHF|CAD|AUD)\b)\s?\d[\d\s.,]*(?:\s?[-–—to]{1,3}\s?[$€£₴₽₸₹]?\s?\d[\d\s.,]*)?(?:\s?(?:k|K))?\s?(?:per\s+\w+|\/\s*\w+|gross|net)?/,
  );
  return match ? normalizeWhitespace(match[0]) : '';
}

/**
 * Слой 4: выбирает самый «плотный» текстовый блок страницы как описание.
 * Кандидаты оцениваются по длине текста со штрафом за навигацию и подвалы.
 */
export function findDescription(root: ParentNode): string {
  for (const selector of DESCRIPTION_SELECTORS) {
    const element = root.querySelector(selector);
    const text = elementText(element);
    if (text.length >= 400) return text;
  }

  const candidates = Array.from(root.querySelectorAll('div,section,article,main'));
  let best = '';
  let bestScore = 0;
  for (const candidate of candidates) {
    const className = `${candidate.className ?? ''} ${candidate.id ?? ''}`.toLowerCase();
    if (/nav|header|footer|sidebar|menu|cookie|banner|related|similar|recommend/.test(className)) {
      continue;
    }
    const text = elementText(candidate);
    if (text.length < 300) continue;
    const linkDensity = candidate.querySelectorAll('a').length / Math.max(1, text.length / 200);
    const score = text.length * (1 - Math.min(0.9, linkDensity * 0.25));
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return best;
}

/** Эвристическая проверка, по которой попап и панель подписывают текущую страницу. */
export function looksLikeJobPage(doc: Document): boolean {
  if (
    doc.querySelector('script[type="application/ld+json"]')?.textContent?.includes('JobPosting')
  ) {
    return true;
  }
  const text = normalizeWhitespace(doc.body?.textContent ?? '')
    .slice(0, 8000)
    .toLowerCase();
  const signals = [
    /\bapply (now|for this job)\b/,
    /\bjob description\b/,
    /\bresponsibilities\b/,
    /\brequirements\b/,
    /\bwhat we offer\b/,
    /\bemployment type\b/,
  ];
  const hits = signals.filter((re) => re.test(text)).length;
  return hits >= 2 && findTitle(doc).length > 0;
}
