import { describe, expect, it } from 'vitest';
import {
  dedupeJobs,
  descriptionHash,
  findDuplicate,
  fingerprintOf,
  jobFingerprint,
  listingIdFromUrl,
  normalizeCompany,
  normalizeTitle,
} from '@/core/extraction/fingerprint';
import { jobSchema, type Job } from '@/types/job';
import { normalizeUrl } from '@/utils/url';
import { makeJob } from '../fixtures/jobs';

function toJob(overrides = {}): Job {
  const extracted = makeJob(overrides);
  return jobSchema.parse({
    ...extracted,
    id: `job_${Math.random().toString(36).slice(2)}`,
    fingerprint: fingerprintOf(extracted),
    discoveredAt: Date.now(),
    updatedAt: Date.now(),
  });
}

describe('нормализация', () => {
  it('убирает шум из названий вакансий', () => {
    expect(normalizeTitle('Senior Node.js Developer (m/f/d) — Remote')).toBe(
      'senior node.js developer',
    );
  });

  it('убирает правовые формы из названий компаний', () => {
    expect(normalizeCompany('Example Inc.')).toBe('example');
    expect(normalizeCompany('Acme GmbH')).toBe('acme');
  });

  it('убирает трекинговые параметры из URL', () => {
    expect(normalizeUrl('https://www.Example.com/jobs/1?utm_source=x&id=5#top')).toBe(
      'https://example.com/jobs/1?id=5',
    );
  });

  it('извлекает id вакансии на сайте', () => {
    expect(listingIdFromUrl('https://indeed.com/viewjob?jk=abc123')).toBe('abc123');
    expect(listingIdFromUrl('https://linkedin.com/jobs/view/3912345678')).toBe('3912345678');
  });
});

describe('отпечатки', () => {
  it('совпадает для одной вакансии на двух сайтах', () => {
    const linkedin = makeJob({ url: 'https://linkedin.com/jobs/view/1?trk=abc' });
    const indeed = makeJob({
      url: 'https://indeed.com/viewjob?jk=zzz',
      title: 'Senior Node.js Developer (m/f/d)',
      company: 'Example Inc',
    });
    expect(fingerprintOf(linkedin)).toBe(fingerprintOf(indeed));
  });

  it('различает разные вакансии одной компании', () => {
    const a = makeJob();
    const b = makeJob({ title: 'Senior Python Developer' });
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
  });

  it('опирается на URL, когда компания неизвестна', () => {
    const fingerprint = jobFingerprint({
      title: 'Dev',
      company: '',
      location: '',
      url: 'https://x.test/a',
      description: 'text',
    });
    expect(fingerprint.startsWith('u:')).toBe(true);
  });

  it('хеширует описание стабильно, невзирая на пробелы', () => {
    expect(descriptionHash('Hello   world\n\n')).toBe(descriptionHash('hello world'));
  });
});

describe('поиск дублей', () => {
  it('находит точный дубль по отпечатку', () => {
    const existing = toJob();
    const match = findDuplicate(makeJob(), [existing]);
    expect(match?.reason).toBe('fingerprint');
    expect(match?.confidence).toBe(1);
  });

  it('находит дубль по URL, даже если названия разные', () => {
    const existing = toJob();
    const candidate = makeJob({ title: 'Completely Different Heading', company: 'Other Co' });
    const match = findDuplicate(candidate, [existing]);
    expect(match?.reason).toBe('url');
  });

  it('находит почти-дубли одной компании', () => {
    const existing = toJob();
    const candidate = makeJob({
      url: 'https://other.test/job/9',
      title: 'Senior Node.js Developer - Remote',
    });
    const match = findDuplicate(candidate, [existing]);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('не считает дублями разные вакансии', () => {
    const existing = toJob();
    const candidate = makeJob({
      url: 'https://other.test/job/42',
      title: 'Marketing Manager',
      company: 'Different Company',
      description: 'Marketing role with no engineering content at all.',
    });
    expect(findDuplicate(candidate, [existing])).toBeNull();
  });
});

describe('схлопывание дублей в списке', () => {
  it('одинаковая вакансия показывается один раз', () => {
    const first = toJob({ title: 'Vue Developer', company: 'Acme', location: 'Yerevan' });
    const second = toJob({ title: 'Vue Developer', company: 'Acme', location: 'Yerevan' });
    expect(first.fingerprint).toBe(second.fingerprint);

    const list = dedupeJobs([first, second]);
    expect(list).toHaveLength(1);
  });

  it('разные вакансии остаются на месте', () => {
    const a = toJob({ title: 'Vue Developer', company: 'Acme' });
    const b = toJob({ title: 'Go Developer', company: 'Acme' });
    const c = toJob({ title: 'Vue Developer', company: 'Globex' });
    expect(dedupeJobs([a, b, c])).toHaveLength(3);
  });

  it('дубль по адресу схлопывается даже с другим отпечатком', () => {
    const url = 'https://jobs.example.com/vacancy/42?utm_source=x';
    const a = toJob({ title: 'Vue Developer', company: 'Acme', url });
    const b = toJob({
      title: 'Vue 3 Developer',
      company: 'Acme Inc.',
      url: 'https://jobs.example.com/vacancy/42',
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(dedupeJobs([a, b])).toHaveLength(1);
  });

  it('остаётся запись, по которой уже проделана работа', () => {
    const bare = toJob({ title: 'Vue Developer', company: 'Acme' });
    const saved = {
      ...toJob({ title: 'Vue Developer', company: 'Acme' }),
      state: 'saved' as const,
      savedAt: Date.now(),
      score: 88,
    };
    // Порядок не должен решать: побеждает та, где есть что терять.
    expect(dedupeJobs([bare, saved])[0]?.id).toBe(saved.id);
    expect(dedupeJobs([saved, bare])[0]?.id).toBe(saved.id);
  });

  it('при равных правах остаётся обновлённая последней', () => {
    const older = { ...toJob({ title: 'Vue Developer', company: 'Acme' }), updatedAt: 1000 };
    const newer = { ...toJob({ title: 'Vue Developer', company: 'Acme' }), updatedAt: 2000 };
    expect(dedupeJobs([older, newer])[0]?.id).toBe(newer.id);
  });

  it('порядок оставшихся вакансий не меняется', () => {
    const a = toJob({ title: 'A', company: 'Acme' });
    const dup = toJob({ title: 'A', company: 'Acme' });
    const b = toJob({ title: 'B', company: 'Acme' });
    const list = dedupeJobs([a, dup, b]);
    expect(list.map((job) => job.title)).toEqual(['A', 'B']);
  });

  it('пустой список остаётся пустым', () => {
    expect(dedupeJobs([])).toEqual([]);
  });
});
