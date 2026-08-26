import { describe, expect, it } from 'vitest';
import { jobSchema, type Job } from '@/types/job';
import { fingerprintOf } from '@/core/extraction/fingerprint';
import {
  addTag,
  collectTags,
  hideCompanies,
  isArchived,
  isHiddenCompany,
  normalizeTag,
  removeTag,
  showCompany,
} from '@/core/pipeline/triage';
import { makeJob } from '../fixtures/jobs';

function toJob(overrides = {}): Job {
  const extracted = makeJob(overrides);
  return jobSchema.parse({
    ...extracted,
    id: `job_${Math.random().toString(36).slice(2)}`,
    fingerprint: fingerprintOf(extracted),
    discoveredAt: 1,
    updatedAt: 1,
  });
}

describe('пометки', () => {
  it('не задваиваются независимо от регистра и пробелов', () => {
    let tags = addTag([], 'Удалёнка');
    tags = addTag(tags, 'удалёнка');
    tags = addTag(tags, '  Удалёнка  ');
    expect(tags).toEqual(['Удалёнка']);
  });

  it('пустая пометка не добавляется', () => {
    expect(addTag([], '   ')).toEqual([]);
  });

  it('убираются без учёта регистра', () => {
    expect(removeTag(['Удалёнка', 'Vue'], 'удалёнка')).toEqual(['Vue']);
  });

  it('разные русские пометки остаются разными', () => {
    // Нормализация под технологии оставляет от кириллицы пустую строку, и на
    // ней все русские пометки выглядели бы как одна и та же.
    let tags = addTag([], 'удалёнка');
    tags = addTag(tags, 'хорошая зп');
    tags = addTag(tags, 'спросить про овертаймы');
    expect(tags).toEqual(['удалёнка', 'хорошая зп', 'спросить про овертаймы']);
  });

  it('убирается ровно одна русская пометка, а не все сразу', () => {
    expect(removeTag(['удалёнка', 'офис', 'хорошая зп'], 'офис')).toEqual([
      'удалёнка',
      'хорошая зп',
    ]);
  });

  it('внутренние пробелы схлопываются, длина ограничена', () => {
    expect(normalizeTag('  хорошая    зп  ')).toBe('хорошая зп');
    expect(normalizeTag('я'.repeat(50))).toHaveLength(30);
  });

  it('в фильтр попадают все пометки из списка, по одному разу и по алфавиту', () => {
    const jobs = [toJob({ title: 'A' }), toJob({ title: 'B' })];
    jobs[0]!.tags = ['Vue', 'удалёнка'];
    jobs[1]!.tags = ['удалёнка', 'офис'];
    // Русский порядок сравнения ставит кириллицу перед латиницей — интерфейс
    // русский, и это ровно то, чего человек ждёт от списка своих пометок.
    expect(collectTags(jobs)).toEqual(['офис', 'удалёнка', 'Vue']);
  });
});

describe('архив', () => {
  it('архив — это отклонённая вакансия, а не удалённая', () => {
    expect(isArchived(toJob() as Job)).toBe(false);
    expect(isArchived({ ...toJob(), state: 'rejected' })).toBe(true);
  });
});

describe('скрытые компании', () => {
  it('правовая форма не мешает совпадению', () => {
    const job = toJob({ company: 'Acme Inc.' });
    expect(isHiddenCompany(job, ['Acme'])).toBe(true);
    expect(isHiddenCompany(job, ['acme llc'])).toBe(true);
  });

  it('чужая компания не скрывается', () => {
    expect(isHiddenCompany(toJob({ company: 'Acme' }), ['Globex'])).toBe(false);
  });

  it('вакансия без компании не скрывается пустой строкой в списке', () => {
    expect(isHiddenCompany(toJob({ company: '' }), [''])).toBe(false);
  });

  it('русское название компании тоже скрывается', () => {
    const job = toJob({ company: 'Яндекс' });
    expect(isHiddenCompany(job, ['яндекс'])).toBe(true);
    expect(isHiddenCompany(job, ['Озон'])).toBe(false);
  });

  it('две разные русские компании не считаются одной', () => {
    let hidden = hideCompanies([], 'Яндекс');
    hidden = hideCompanies(hidden, 'Озон');
    expect(hidden).toEqual(['Яндекс', 'Озон']);
    expect(showCompany(hidden, 'Озон')).toEqual(['Яндекс']);
  });

  it('добавление не задваивает одну и ту же компанию', () => {
    let hidden = hideCompanies([], 'Acme');
    hidden = hideCompanies(hidden, 'Acme Inc.');
    expect(hidden).toEqual(['Acme']);
  });

  it('удаление возвращает компанию в выдачу', () => {
    expect(showCompany(['Acme', 'Globex'], 'acme ltd')).toEqual(['Globex']);
  });
});
