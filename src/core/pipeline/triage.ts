import type { Job } from '@/types/job';
import { normalizeCompany } from '@/core/extraction/fingerprint';
import { unique } from '@/utils/text';

/**
 * Разбор списка вакансий: свои пометки, архив и скрытые компании.
 *
 * Всё считается правилами и без AI — от того, что человек убрал компанию из
 * выдачи, зависит, увидит ли он вакансию вообще, и такое решение должно быть
 * предсказуемым.
 */

/** Приводит пометку к виду, в котором её можно сравнивать: «Удалёнка» = «удалёнка». */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').slice(0, 30);
}

/**
 * Сравнение своих пометок и названий компаний.
 *
 * `normalizeToken` здесь не годится, хотя и напрашивается: он собран под
 * технологии и оставляет только латиницу с цифрами, поэтому любые две русские
 * пометки схлопывались бы в пустую строку и считались одинаковыми.
 */
function plain(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

export function addTag(tags: string[], tag: string): string[] {
  const value = normalizeTag(tag);
  if (!value) return tags;
  const exists = tags.some((entry) => plain(entry) === plain(value));
  return exists ? tags : [...tags, value];
}

export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((entry) => plain(entry) !== plain(tag));
}

/** Все пометки, встречающиеся в списке, — для фильтра по ним. */
export function collectTags(jobs: Job[]): string[] {
  return unique(jobs.flatMap((job) => job.tags)).sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Вакансия убрана в архив: интереса не представляет, но и удалять её незачем. */
export function isArchived(job: Job): boolean {
  return job.state === 'rejected';
}

/**
 * Одна ли это компания. `normalizeCompany` убирает правовые формы, из-за чего
 * «Acme» и «Acme Inc.» совпадают, — но заодно вычищает кириллицу, и «Яндекс»
 * превращается в пустую строку. Поэтому когда от названия после нормализации
 * ничего не осталось, сравниваем сами названия.
 */
function sameCompany(a: string, b: string): boolean {
  const left = normalizeCompany(a);
  const right = normalizeCompany(b);
  if (left && right) return left === right;
  return plain(a) === plain(b);
}

/** Компания скрыта пользователем — её вакансии не показываем. */
export function isHiddenCompany(job: Job, hiddenCompanies: string[]): boolean {
  if (!job.company.trim()) return false;
  return hiddenCompanies.some((entry) => sameCompany(entry, job.company));
}

export function hideCompanies(hidden: string[], company: string): string[] {
  const value = company.trim();
  if (!value) return hidden;
  const exists = hidden.some((entry) => sameCompany(entry, value));
  return exists ? hidden : [...hidden, value];
}

export function showCompany(hidden: string[], company: string): string[] {
  return hidden.filter((entry) => !sameCompany(entry, company));
}
