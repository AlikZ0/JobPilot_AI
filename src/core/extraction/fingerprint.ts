import type { ExtractedJob, Job, JobFingerprintInput } from '@/types/job';
import { hashString } from '@/utils/hash';
import { normalizeToken, similarity } from '@/utils/text';
import { normalizeUrl, safeUrl } from '@/utils/url';

/** Слова, которые различаются на разных сайтах для одной вакансии и не несут смысла. */
const TITLE_NOISE = new Set([
  'm',
  'f',
  'd',
  'x',
  'w',
  'mfd',
  'remote',
  'hybrid',
  'onsite',
  'fulltime',
  'full',
  'time',
  'urgent',
  'hiring',
  'now',
  'contract',
  'permanent',
  'job',
  'vacancy',
  'position',
  'opening',
]);

const COMPANY_SUFFIX =
  /\b(inc|llc|ltd|limited|gmbh|s\.?r\.?o|b\.?v|corp|corporation|co|company|group|holdings|ag|sa|as|oy|ab)\b/g;

export function normalizeTitle(title: string): string {
  return normalizeToken(title)
    .split(' ')
    .filter((w) => w && !TITLE_NOISE.has(w))
    .join(' ')
    .trim();
}

export function normalizeCompany(company: string): string {
  return (
    normalizeToken(company)
      .replace(COMPANY_SUFFIX, ' ')
      // После удаления правовых форм остаётся мусорная пунктуация («Example Inc.» -> «example .»).
      .replace(/[.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function normalizeLocation(location: string): string {
  return normalizeToken(location)
    .split(' ')
    .filter((w) => w && !['remote', 'hybrid', 'onsite', 'office'].includes(w))
    .slice(0, 3)
    .join(' ');
}

/** Стабильный дайджест текста описания, устойчивый к изменениям пробелов. */
export function descriptionHash(description: string): string {
  const normalized = normalizeToken(description).split(' ').filter(Boolean).slice(0, 400).join(' ');
  return hashString(normalized);
}

/**
 * Идентичность вакансии между сайтами: компания + должность + локация, а
 * дайджест описания разрешает спорные случаи. URL намеренно не входит в
 * основной хеш, чтобы одна вакансия на LinkedIn и Indeed схлопнулась в одну.
 */
export function jobFingerprint(input: JobFingerprintInput): string {
  const company = normalizeCompany(input.company);
  const title = normalizeTitle(input.title);
  const location = normalizeLocation(input.location);
  if (company && title) {
    return `c:${hashString(`${company}|${title}|${location}`)}`;
  }
  // Без названия компании сопоставить сайты нельзя — опираемся на URL.
  const url = normalizeUrl(input.url);
  const base = url || descriptionHash(input.description);
  return `u:${hashString(`${title}|${base}`)}`;
}

export function fingerprintOf(job: ExtractedJob): string {
  return jobFingerprint({
    title: job.title,
    company: job.company,
    location: job.location || job.city || job.country,
    url: job.url,
    description: job.description,
  });
}

export interface DuplicateMatch {
  job: Job;
  confidence: number;
  reason: 'fingerprint' | 'url' | 'similarity';
}

/** Та же вакансия по другому URL: нечёткое сопоставление вторым проходом. */
export function findDuplicate(candidate: ExtractedJob, existing: Job[]): DuplicateMatch | null {
  const fp = fingerprintOf(candidate);
  const candidateUrl = normalizeUrl(candidate.url);
  const candidateCompany = normalizeCompany(candidate.company);
  const candidateTitle = normalizeTitle(candidate.title);
  const candidateDescription = descriptionHash(candidate.description);

  for (const job of existing) {
    if (job.fingerprint === fp) return { job, confidence: 1, reason: 'fingerprint' };
  }
  for (const job of existing) {
    if (candidateUrl && normalizeUrl(job.url) === candidateUrl) {
      return { job, confidence: 0.98, reason: 'url' };
    }
  }
  let best: DuplicateMatch | null = null;
  for (const job of existing) {
    if (!candidateCompany || normalizeCompany(job.company) !== candidateCompany) continue;
    const titleScore = similarity(candidateTitle, normalizeTitle(job.title));
    const sameBody = descriptionHash(job.description) === candidateDescription ? 0.2 : 0;
    const confidence = Math.min(1, titleScore + sameBody);
    if (confidence >= 0.8 && (!best || confidence > best.confidence)) {
      best = { job, confidence, reason: 'similarity' };
    }
  }
  return best;
}

/** Id вакансии в рамках конкретного сайта — помогает убирать дубли ссылок в списке. */
export function listingIdFromUrl(url: string): string {
  const parsed = safeUrl(url);
  if (!parsed) return '';
  const fromQuery =
    parsed.searchParams.get('currentJobId') ??
    parsed.searchParams.get('jk') ??
    parsed.searchParams.get('jobId') ??
    parsed.searchParams.get('vjk');
  if (fromQuery) return fromQuery;
  const numeric = parsed.pathname.match(/(\d{6,})/);
  return numeric?.[1] ?? '';
}

/**
 * Насколько далеко продвинута работа по вакансии. Из двух одинаковых записей
 * показываем ту, где есть что терять: сохранённую, проанализированную,
 * с готовой заявкой — а не пустой дубль, найденный вторым проходом.
 */
function progressRank(job: Job): number {
  const byState: Record<string, number> = {
    submitted: 6,
    application_ready: 5,
    application_preparing: 4,
    saved: 3,
    analyzed: 2,
    analyzing: 1,
  };
  let rank = byState[job.state] ?? 0;
  if (job.savedAt !== null) rank += 3;
  if (job.score !== null) rank += 2;
  if (job.notes) rank += 1;
  return rank;
}

/**
 * Один ли это адрес и одна ли вакансия. Совпадения URL мало: у части сайтов
 * извлечение отдаёт общую страницу карьеры сразу нескольким вакансиям, и по
 * одному адресу их бы склеило в одну. Поэтому рядом проверяется, что это
 * действительно та же должность у того же работодателя.
 */
const SAME_URL_TITLE_MATCH = 0.6;

function sameVacancyAtUrl(a: Job, b: Job): boolean {
  if (normalizeCompany(a.company) !== normalizeCompany(b.company)) return false;
  // Порог ниже, чем при сверке между сайтами (`findDuplicate`): там название —
  // единственная зацепка, здесь адрес уже почти всё сказал, и от заголовка
  // требуется только не быть заведомо чужим. «Vue Developer» и «Vue 3
  // Developer» по одной ссылке — одно объявление, «Vue» и «Go» — разные.
  return similarity(normalizeTitle(a.title), normalizeTitle(b.title)) >= SAME_URL_TITLE_MATCH;
}

/** Из двух одинаковых записей оставляем ту, где больше проделанной работы. */
function preferred(a: Job, b: Job): Job {
  const rankA = progressRank(a);
  const rankB = progressRank(b);
  if (rankA !== rankB) return rankA > rankB ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

/**
 * Убирает из списка повторы одной и той же вакансии.
 *
 * При сохранении дубли схлопываются в одну запись (`upsertExtractedJob`), но в
 * базе они всё равно заводятся: импорт резервной копии, записи, сделанные до
 * появления отпечатков, промах эвристики на слегка разном написании должности.
 * Показывать человеку две одинаковых карточки нельзя, а удалять записи молча
 * тем более — к дублю может быть привязана заявка. Поэтому лишние просто не
 * попадают в список.
 *
 * Признаком одинаковости считается совпадение отпечатка — того самого, по
 * которому вакансии сверяются при сохранении, — либо общий адрес при похожей
 * должности у того же работодателя.
 */
export function dedupeJobs(jobs: Job[]): Job[] {
  const kept: Job[] = [];
  const byFingerprint = new Map<string, number>();
  const byUrl = new Map<string, number[]>();

  for (const job of jobs) {
    const url = normalizeUrl(job.url);
    let at = job.fingerprint ? byFingerprint.get(job.fingerprint) : undefined;

    if (at === undefined && url) {
      for (const index of byUrl.get(url) ?? []) {
        if (sameVacancyAtUrl(job, kept[index] as Job)) {
          at = index;
          break;
        }
      }
    }

    if (at === undefined) {
      const index = kept.push(job) - 1;
      if (job.fingerprint) byFingerprint.set(job.fingerprint, index);
      if (url) byUrl.set(url, [...(byUrl.get(url) ?? []), index]);
      continue;
    }

    kept[at] = preferred(job, kept[at] as Job);
    // Отпечаток проигравшего тоже должен вести сюда: третья такая же запись
    // обязана найти пару независимо от того, чей отпечаток она повторяет.
    if (job.fingerprint) byFingerprint.set(job.fingerprint, at);
  }

  return kept;
}
