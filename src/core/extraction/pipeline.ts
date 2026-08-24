import { extractedJobSchema, type ExtractedJob, type ExtractionSource } from '@/types/job';
import { normalizeWhitespace, truncate, unique } from '@/utils/text';
import { normalizeUrl } from '@/utils/url';
import { extractFromJsonLd } from './jsonld';
import { readMeta, splitTitleAndCompany } from './meta';
import { findCompany, findDescription, findLocation, findSalary, findTitle } from './heuristics';
import { splitSections } from './sections';
import { detectTechnologies } from './techDictionary';
import {
  detectEmploymentType,
  detectLanguageRequirements,
  detectSeniority,
  detectWorkMode,
  parseSalary,
  splitLocation,
} from './normalize';

export interface ExtractionContext {
  doc: Document;
  url: string;
  maxDescriptionChars: number;
  /** Id адаптера, сохраняемый в вакансии, чтобы UI показал источник данных. */
  source: string;
}

/** Значения, которые адаптер может задать принудительно — они важнее общих эвристик. */
export interface AdapterHints {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  salaryText?: string;
  applyUrl?: string;
  workModeText?: string;
  postedAt?: string;
}

function jsonLdScripts(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((node) => node.textContent ?? '')
    .filter((text) => text.includes('JobPosting'));
}

const REQUIRED_FIELDS = ['title', 'company', 'description'] as const;

/**
 * Качество — доля заполненных важных полей, взвешенная по надёжности источника.
 * От него зависит, нужен ли AI-фолбэк, и оно показывается в интерфейсе, чтобы
 * пользователь понимал, насколько можно доверять извлечению.
 */
export function computeQuality(job: ExtractedJob): number {
  const weights: [keyof ExtractedJob, number][] = [
    ['title', 0.2],
    ['company', 0.15],
    ['description', 0.3],
    ['location', 0.1],
    ['requirements', 0.1],
    ['technologies', 0.1],
    ['salary', 0.05],
  ];
  let score = 0;
  for (const [field, weight] of weights) {
    const value = job[field];
    let present = false;
    if (typeof value === 'string') present = value.trim().length > 0;
    else if (Array.isArray(value)) present = value.length > 0;
    else if (field === 'salary') present = job.salary.min !== null;
    if (!present) continue;
    const source = job.fieldSources[field as string];
    const trust = source === 'jsonld' ? 1 : source === 'meta' ? 0.9 : source === 'ai' ? 0.85 : 0.8;
    score += weight * trust;
  }
  if (job.description.length > 600) score += 0.05;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

export function isUsableExtraction(job: ExtractedJob): boolean {
  return (
    REQUIRED_FIELDS.every((field) => String(job[field]).trim().length > 0) &&
    job.description.length >= 120
  );
}

function mergeField(
  target: Record<string, unknown>,
  sources: Record<string, ExtractionSource>,
  key: string,
  value: string | undefined,
  source: ExtractionSource,
): void {
  if (!value) return;
  const current = target[key];
  if (typeof current === 'string' && current.trim().length > 0) return;
  target[key] = value;
  sources[key] = source;
}

/**
 * Прогоняет все слои извлечения по приоритету: JSON-LD → подсказки адаптера →
 * meta-теги → семантический HTML и DOM-эвристики. AI-фолбэк применяется позже,
 * в фоновом воркере, и только если этот результат непригоден.
 */
export function extractJobFromDocument(
  context: ExtractionContext,
  hints: AdapterHints = {},
): ExtractedJob {
  const { doc, url, maxDescriptionChars, source } = context;
  const fromJsonLd = extractFromJsonLd(jsonLdScripts(doc), url);
  const meta = readMeta(doc);

  const base: Record<string, unknown> = fromJsonLd
    ? { ...fromJsonLd }
    : { ...extractedJobSchema.parse({}) };
  const sources: Record<string, ExtractionSource> = fromJsonLd
    ? { ...fromJsonLd.fieldSources }
    : {};

  mergeField(base, sources, 'title', hints.title, 'dom');
  mergeField(base, sources, 'company', hints.company, 'dom');
  mergeField(base, sources, 'location', hints.location, 'dom');
  mergeField(base, sources, 'description', hints.description, 'dom');
  mergeField(base, sources, 'applyUrl', hints.applyUrl, 'dom');
  mergeField(base, sources, 'postedAt', hints.postedAt, 'dom');

  if (!base.title && meta.title) {
    const split = splitTitleAndCompany(meta.title);
    mergeField(base, sources, 'title', split.title, 'meta');
    mergeField(base, sources, 'company', split.company, 'meta');
  }
  mergeField(base, sources, 'company', meta.siteName, 'meta');

  mergeField(base, sources, 'title', findTitle(doc), 'dom');
  mergeField(base, sources, 'company', findCompany(doc), 'dom');
  mergeField(base, sources, 'location', findLocation(doc), 'dom');

  let description = String(base.description ?? '');
  if (description.length < 200) {
    const domDescription = findDescription(doc);
    if (domDescription.length > description.length) {
      description = domDescription;
      sources.description = 'dom';
    }
  }
  if (description.length < 120 && meta.description) {
    description = meta.description;
    sources.description = 'meta';
  }
  description = truncate(description, maxDescriptionChars);
  base.description = description;

  const salaryText = hints.salaryText || findSalary(doc);
  const existingSalary = (base.salary ?? {}) as { min: number | null };
  if (existingSalary.min === null || existingSalary.min === undefined) {
    if (salaryText) {
      base.salary = parseSalary(salaryText);
      sources.salary = 'dom';
    }
  }

  const sections = splitSections(description);
  const currentRequirements = (base.requirements as string[] | undefined) ?? [];
  const currentResponsibilities = (base.responsibilities as string[] | undefined) ?? [];
  if (currentRequirements.length === 0) base.requirements = sections.requirements;
  if (currentResponsibilities.length === 0) base.responsibilities = sections.responsibilities;
  if (((base.benefits as string[] | undefined) ?? []).length === 0)
    base.benefits = sections.benefits;

  const title = String(base.title ?? '');
  const location = String(base.location ?? '');
  const haystack = `${title}\n${location}\n${description}`;

  if (!base.workMode || base.workMode === 'unknown') {
    base.workMode = detectWorkMode(`${haystack} ${hints.workModeText ?? ''}`);
  }
  if (!base.seniority || base.seniority === 'unknown') {
    base.seniority = detectSeniority(`${title} ${description}`);
  }
  if (!base.employmentType || base.employmentType === 'unknown') {
    base.employmentType = detectEmploymentType(haystack);
  }

  const technologies = unique([
    ...((base.technologies as string[] | undefined) ?? []),
    ...detectTechnologies(haystack),
  ]);
  base.technologies = technologies;

  const languages = (base.languageRequirements as string[] | undefined) ?? [];
  base.languageRequirements = languages.length
    ? languages
    : detectLanguageRequirements(description);

  const { city, country } = splitLocation(location);
  if (!base.city) base.city = city;
  if (!base.country) base.country = country;

  base.url = normalizeUrl(String(base.url || url));
  base.title = normalizeWhitespace(title);
  base.company = normalizeWhitespace(String(base.company ?? ''));
  base.source = source;
  base.fieldSources = sources;

  const parsed = extractedJobSchema.parse(base);
  return { ...parsed, extractionQuality: computeQuality(parsed) };
}
