import { describe, expect, it } from 'vitest';
import { searchTech } from '@/core/extraction/techDictionary';

/** Первое предложение списка: именно его выберет Enter в поле ввода. */
function top(query: string): string {
  return searchTech(query)[0]?.entry.canonical ?? '';
}

describe('подсказки технологий', () => {
  it('точное имя стоит первым', () => {
    expect(top('React')).toBe('React');
    expect(top('postgresql')).toBe('PostgreSQL');
  });

  it('находит по началу слова, не дожидаясь полного набора', () => {
    expect(top('post')).toBe('PostgreSQL');
    expect(top('kuber')).toBe('Kubernetes');
  });

  it('понимает общепринятые сокращения', () => {
    expect(top('ts')).toBe('TypeScript');
    expect(top('k8s')).toBe('Kubernetes');
    expect(top('js')).toBe('JavaScript');
  });

  it('прощает опечатку — ради этого список и появился', () => {
    expect(top('postgress')).toBe('PostgreSQL');
    expect(top('kubernets')).toBe('Kubernetes');
    expect(top('typescrpt')).toBe('TypeScript');
  });

  it('прощает перестановку соседних букв', () => {
    expect(top('Reakt')).toBe('React');
    expect(top('Postgersql')).toBe('PostgreSQL');
  });

  it('в коротком запросе опечатку не выдумывает: «go» — это Go, а не Vue', () => {
    expect(top('go')).toBe('Go');
  });

  it('показывает, по какому написанию нашлось', () => {
    const [first] = searchTech('k8s');
    expect(first?.matchedAs).toBe('k8s');
    expect(first?.entry.canonical).toBe('Kubernetes');
  });

  it('на пустой запрос отдаёт начало словаря, чтобы список был виден сразу', () => {
    expect(searchTech('').length).toBeGreaterThan(0);
  });

  it('понимает название, набранное кириллицей', () => {
    expect(top('реакт')).toBe('React');
    expect(top('постгрес')).toBe('PostgreSQL');
    expect(top('кубернетес')).toBe('Kubernetes');
    expect(top('питон')).toBe('Python');
    expect(top('вью')).toBe('Vue');
  });

  it('версия рядом с названием не мешает поиску', () => {
    expect(top('Vue 3')).toBe('Vue');
    expect(top('react 18')).toBe('React');
  });

  it('для полной бессмыслицы не выдумывает совпадений', () => {
    expect(searchTech('!!!')).toHaveLength(0);
    expect(searchTech('щщщщщщ')).toHaveLength(0);
  });

  it('не отдаёт больше запрошенного', () => {
    expect(searchTech('s', 3).length).toBeLessThanOrEqual(3);
  });
});
