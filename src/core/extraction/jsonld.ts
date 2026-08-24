import { extractedJobSchema, type ExtractedJob } from '@/types/job';
import { normalizeWhitespace, splitLines, truncate } from '@/utils/text';
import { detectTechnologies } from './techDictionary';
import {
  detectLanguageRequirements,
  detectSeniority,
  detectWorkMode,
  employmentTypeFromSchema,
  parseSalary,
  type MaybeWorkMode,
} from './normalize';
import { htmlToText } from './html';
import { splitSections } from './sections';

interface JsonLdNode {
  [key: string]: unknown;
}

/** Обход @graph и массивов в глубину в поисках узлов JobPosting. */
export function collectJobPostings(payload: unknown, depth = 0): JsonLdNode[] {
  if (depth > 6 || !payload) return [];
  if (Array.isArray(payload)) return payload.flatMap((item) => collectJobPostings(item, depth + 1));
  if (typeof payload !== 'object') return [];
  const node = payload as JsonLdNode;
  const out: JsonLdNode[] = [];
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'jobposting')) {
    out.push(node);
  }
  if (node['@graph']) out.push(...collectJobPostings(node['@graph'], depth + 1));
  return out;
}

function str(value: unknown): string {
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (typeof value === 'number') return String(value);
  return '';
}

function firstOf(node: JsonLdNode, ...keys: string[]): unknown {
  for (const key of keys) {
    if (node[key] !== undefined && node[key] !== null) return node[key];
  }
  return undefined;
}

function readLocation(node: JsonLdNode): { location: string; city: string; country: string } {
  const raw = firstOf(node, 'jobLocation');
  const first = Array.isArray(raw) ? raw[0] : raw;
  const address = (first as JsonLdNode | undefined)?.['address'] as JsonLdNode | undefined;
  const city = str(address?.['addressLocality']);
  const region = str(address?.['addressRegion']);
  const country =
    str(address?.['addressCountry']) || str((address?.['addressCountry'] as JsonLdNode)?.['name']);
  const location = [city, region, country].filter(Boolean).join(', ');
  return { location, city, country };
}

function readSalary(node: JsonLdNode): { text: string } {
  const base = firstOf(node, 'baseSalary', 'estimatedSalary');
  if (!base) return { text: '' };
  const salaryNode = (Array.isArray(base) ? base[0] : base) as JsonLdNode;
  const currency = str(firstOf(salaryNode, 'currency', 'salaryCurrency'));
  const value = salaryNode['value'] as JsonLdNode | number | string | undefined;
  if (typeof value === 'number' || typeof value === 'string') {
    return { text: `${value} ${currency}`.trim() };
  }
  if (value && typeof value === 'object') {
    const min = str(firstOf(value, 'minValue'));
    const max = str(firstOf(value, 'maxValue'));
    const single = str(firstOf(value, 'value'));
    const unit = str(firstOf(value, 'unitText'));
    const amount = min && max ? `${min} - ${max}` : single || min || max;
    if (!amount) return { text: '' };
    const period = unit ? ` per ${unit.toLowerCase()}` : '';
    return { text: `${amount} ${currency}${period}`.trim() };
  }
  return { text: '' };
}

function readWorkMode(node: JsonLdNode, description: string): MaybeWorkMode {
  const remoteType = str(firstOf(node, 'jobLocationType'));
  if (/telecommute/i.test(remoteType)) return 'remote';
  return detectWorkMode(`${str(node['title'])} ${description}`);
}

/**
 * Слой 1 извлечения: schema.org JobPosting, встроенный как JSON-LD. Это самый
 * надёжный источник, поэтому его поля выигрывают у DOM-эвристик.
 */
export function extractFromJsonLd(scripts: string[], pageUrl: string): ExtractedJob | null {
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.replace(/^\s*<!--/, '').replace(/-->\s*$/, ''));
    } catch {
      continue;
    }
    const postings = collectJobPostings(parsed);
    if (postings.length === 0) continue;
    const node = postings[0]!;

    const descriptionHtml = str(firstOf(node, 'description'));
    const description = htmlToText(descriptionHtml);
    const hiringOrg = firstOf(node, 'hiringOrganization') as JsonLdNode | string | undefined;
    const company =
      typeof hiringOrg === 'string' ? normalizeWhitespace(hiringOrg) : str(hiringOrg?.['name']);
    const companyUrl = typeof hiringOrg === 'object' ? str(hiringOrg?.['url']) : '';
    const { location, city, country } = readLocation(node);
    const salaryText = readSalary(node).text;
    const sections = splitSections(description);
    const skillsText = [
      str(firstOf(node, 'skills')),
      str(firstOf(node, 'qualifications')),
      str(firstOf(node, 'experienceRequirements')),
    ]
      .filter(Boolean)
      .join('\n');
    const employmentRaw = firstOf(node, 'employmentType');
    const employmentText = Array.isArray(employmentRaw)
      ? employmentRaw.map(str).join(' ')
      : str(employmentRaw);

    const requirements = sections.requirements.length
      ? sections.requirements
      : splitLines(skillsText).slice(0, 30);

    const title = str(firstOf(node, 'title'));
    const url = str(firstOf(node, 'url')) || pageUrl;
    const fields = [
      'title',
      'company',
      'description',
      'location',
      'salary',
      'employmentType',
      'workMode',
    ] as const;
    const fieldSources = Object.fromEntries(fields.map((f) => [f, 'jsonld' as const]));

    return extractedJobSchema.parse({
      title,
      company,
      companyUrl,
      url,
      description,
      requirements,
      responsibilities: sections.responsibilities,
      benefits: sections.benefits,
      salary: parseSalary(salaryText),
      location,
      city,
      country,
      workMode: readWorkMode(node, description),
      seniority: detectSeniority(`${title} ${description}`),
      employmentType: employmentText ? employmentTypeFromSchema(employmentText) : 'unknown',
      technologies: detectTechnologies(`${title}\n${description}\n${skillsText}`),
      languageRequirements: detectLanguageRequirements(description),
      postedAt: str(firstOf(node, 'datePosted')),
      applyUrl: str(firstOf(node, 'applicationContact')) || '',
      source: 'jsonld',
      fieldSources,
      extractionQuality: 0,
    });
  }
  return null;
}

export function truncateDescription(job: ExtractedJob, maxChars: number): ExtractedJob {
  if (job.description.length <= maxChars) return job;
  return { ...job, description: truncate(job.description, maxChars) };
}
