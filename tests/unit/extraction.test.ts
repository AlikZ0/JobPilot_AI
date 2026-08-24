import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
  extractJobFromDocument,
  computeQuality,
  isUsableExtraction,
} from '@/core/extraction/pipeline';
import { extractFromJsonLd, collectJobPostings } from '@/core/extraction/jsonld';
import { splitSections } from '@/core/extraction/sections';
import { htmlToText, decodeEntities } from '@/core/extraction/html';
import {
  parseSalary,
  detectSeniority,
  detectWorkMode,
  detectLanguageRequirements,
  toMonthly,
  languageLevelIndex,
} from '@/core/extraction/normalize';
import {
  detectTechnologies,
  canonicalizeTech,
  expandImplied,
} from '@/core/extraction/techDictionary';
import { DOM_ONLY_PAGE, JSON_LD_PAGE } from '../fixtures/jobs';

function documentFrom(html: string): Document {
  const window = new Window({ url: 'https://jobs.example.com/view/1' });
  window.document.write(html);
  return window.document as unknown as Document;
}

describe('извлечение из JSON-LD', () => {
  it('читает JobPosting из schema.org', () => {
    const doc = documentFrom(JSON_LD_PAGE);
    const job = extractJobFromDocument({
      doc,
      url: 'https://jobs.example.com/view/1',
      maxDescriptionChars: 6000,
      source: 'generic',
    });
    expect(job.title).toBe('Senior Node.js Developer');
    expect(job.company).toBe('Example Inc.');
    expect(job.workMode).toBe('remote');
    expect(job.employmentType).toBe('full_time');
    expect(job.city).toBe('Krakow');
    expect(job.country).toBe('Poland');
    expect(job.salary.min).toBe(3000);
    expect(job.salary.max).toBe(4000);
    expect(job.salary.currency).toBe('USD');
    expect(job.salary.period).toBe('month');
    expect(job.technologies).toContain('Node.js');
    expect(job.technologies).toContain('TypeScript');
    expect(job.technologies).toContain('Docker');
    expect(job.requirements.length).toBeGreaterThan(0);
    expect(job.responsibilities).toContain('Build REST APIs');
    expect(job.fieldSources.title).toBe('jsonld');
    expect(job.extractionQuality).toBeGreaterThan(0.6);
  });

  it('обходит контейнеры @graph', () => {
    const payload = { '@graph': [{ '@type': 'WebPage' }, { '@type': 'JobPosting', title: 'X' }] };
    expect(collectJobPostings(payload)).toHaveLength(1);
  });

  it('возвращает null, если JobPosting нет', () => {
    expect(extractFromJsonLd(['{"@type":"Article"}'], 'https://x.test')).toBeNull();
  });

  it('молча игнорирует битый JSON', () => {
    expect(extractFromJsonLd(['{"@type":"JobPosting"'], 'https://x.test')).toBeNull();
  });
});

describe('DOM-эвристики', () => {
  it('извлекает вакансию без структурированных данных', () => {
    const doc = documentFrom(DOM_ONLY_PAGE);
    const job = extractJobFromDocument({
      doc,
      url: 'https://acme.example/jobs/vue-dev',
      maxDescriptionChars: 6000,
      source: 'generic',
    });
    expect(job.title).toBe('Middle Vue Developer');
    expect(job.company).toBe('Acme GmbH');
    expect(job.location).toBe('Berlin, Germany');
    expect(job.salary.min).toBe(4500);
    expect(job.salary.max).toBe(5500);
    expect(job.salary.currency).toBe('EUR');
    expect(job.technologies).toEqual(expect.arrayContaining(['Vue', 'TypeScript', 'Vite']));
    expect(job.requirements.some((line) => line.includes('Vue'))).toBe(true);
    expect(job.responsibilities.length).toBeGreaterThan(0);
    expect(job.benefits.length).toBeGreaterThan(0);
    expect(isUsableExtraction(job)).toBe(true);
  });

  it('обрезает длинные описания до заданного лимита', () => {
    const long = `<div class="job-description"><p>${'word '.repeat(4000)}</p></div>`;
    const doc = documentFrom(`<html><body><h1>Role</h1>${long}</body></html>`);
    const job = extractJobFromDocument({
      doc,
      url: 'https://x.test/job',
      maxDescriptionChars: 1000,
      source: 'generic',
    });
    expect(job.description.length).toBeLessThanOrEqual(1001);
  });

  it('сообщает о низком качестве, когда почти ничего не найдено', () => {
    const doc = documentFrom('<html><body><p>Nothing here</p></body></html>');
    const job = extractJobFromDocument({
      doc,
      url: 'https://x.test/job',
      maxDescriptionChars: 6000,
      source: 'generic',
    });
    expect(computeQuality(job)).toBeLessThan(0.5);
    expect(isUsableExtraction(job)).toBe(false);
  });
});

describe('разбиение на разделы', () => {
  it('раскладывает пункты по нужным заголовкам', () => {
    const sections = splitSections(
      'Intro text\nRequirements:\n• Node.js\n• Docker\nResponsibilities\n• Build APIs\nWhat we offer\n• Remote work',
    );
    expect(sections.requirements).toEqual(['Node.js', 'Docker']);
    expect(sections.responsibilities).toEqual(['Build APIs']);
    expect(sections.benefits).toEqual(['Remote work']);
  });

  it('использует пункты списка, когда заголовков нет', () => {
    const sections = splitSections('We need:\n- Vue\n- REST');
    expect(sections.requirements).toEqual(['Vue', 'REST']);
  });
});

describe('html в текст', () => {
  it('сохраняет структуру списка и убирает теги', () => {
    const text = htmlToText('<p>Intro</p><ul><li>One</li><li>Two</li></ul>');
    expect(text).toContain('Intro');
    expect(text).toContain('• One');
    expect(text).not.toContain('<');
  });

  it('декодирует html-сущности', () => {
    expect(decodeEntities('R&amp;D &mdash; 100&nbsp;%')).toBe('R&D — 100 %');
    expect(decodeEntities('&#65;&#x42;')).toBe('AB');
  });

  it('вырезает содержимое script', () => {
    expect(htmlToText('<div>Safe<script>alert(1)</script></div>')).not.toContain('alert');
  });
});

describe('разбор зарплаты', () => {
  it.each([
    ['$3,000 - $4,000 per month', { min: 3000, max: 4000, currency: 'USD', period: 'month' }],
    ['80k–100k USD per year', { min: 80000, max: 100000, currency: 'USD', period: 'year' }],
    ['€ 4,500 - € 5,500 / month', { min: 4500, max: 5500, currency: 'EUR', period: 'month' }],
    ['£45 per hour', { min: 45, max: null, currency: 'GBP', period: 'hour' }],
  ])('разбирает %s', (input, expected) => {
    expect(parseSalary(input)).toMatchObject(expected);
  });

  it('возвращает null, когда чисел нет', () => {
    expect(parseSalary('Competitive salary')).toMatchObject({ min: null, max: null });
  });

  it('приводит периоды к месячной сумме', () => {
    expect(toMonthly(60_000, 'year')).toBe(5000);
    expect(toMonthly(1, 'month')).toBe(1);
    expect(toMonthly(10, 'unknown')).toBeNull();
  });
});

describe('нормализаторы', () => {
  it('определяет уровень', () => {
    expect(detectSeniority('Senior Backend Engineer')).toBe('senior');
    expect(detectSeniority('Junior QA')).toBe('junior');
    expect(detectSeniority('Backend Engineer')).toBe('unknown');
  });

  it('определяет формат работы', () => {
    expect(detectWorkMode('Fully remote position')).toBe('remote');
    expect(detectWorkMode('Hybrid, 2 days in office')).toBe('hybrid');
    expect(detectWorkMode('On-site in Berlin')).toBe('office');
  });

  it('находит требования к языкам с уровнем', () => {
    expect(detectLanguageRequirements('English B2 required, German is a plus')).toEqual(
      expect.arrayContaining(['English B2']),
    );
  });

  it('упорядочивает уровни владения языком', () => {
    expect(languageLevelIndex('c1')).toBeGreaterThan(languageLevelIndex('b2'));
    expect(languageLevelIndex('native')).toBeGreaterThan(languageLevelIndex('c2'));
  });
});

describe('словарь технологий', () => {
  it('приводит синонимы к канону', () => {
    expect(canonicalizeTech('nodejs')).toBe('Node.js');
    expect(canonicalizeTech('ts')).toBe('TypeScript');
    expect(canonicalizeTech('SomethingCustom')).toBe('SomethingCustom');
  });

  it('раскрывает подразумеваемые навыки', () => {
    expect(expandImplied('Nuxt')).toEqual(expect.arrayContaining(['Nuxt', 'Vue', 'JavaScript']));
  });

  it('не срабатывает на технологиях внутри других слов', () => {
    const found = detectTechnologies('We use Google Workspace and goal setting');
    expect(found).not.toContain('Go');
  });

  it('находит технологии в тексте', () => {
    const found = detectTechnologies('Experience with Node.js, Postgres and k8s required');
    expect(found).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL', 'Kubernetes']));
  });
});
