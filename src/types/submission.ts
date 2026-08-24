import { z } from 'zod';

/**
 * Журнал откликов — отдельная сущность, а не поле заявки.
 *
 * Заявка (`Application`) описывает подготовку отклика внутри JobPilot и живёт
 * по строгому автомату: в `submitted` она попадает только после явного клика
 * пользователя. Отклик же можно отправить и мимо JobPilot — прямо на сайте, из
 * почты, через рекрутера. Журнал фиксирует сам факт «я откликнулся сюда тогда-то»
 * и потому пополняется автоматически, ничего не подтверждая за пользователя.
 */

export const SUBMISSION_SOURCES = ['auto', 'manual', 'import'] as const;
export type SubmissionSource = (typeof SUBMISSION_SOURCES)[number];

/** Что именно послужило доказательством отклика. */
export const SUBMISSION_SIGNALS = [
  /** Пользователь нажал «Зафиксировать отправку» на экране проверки. */
  'user_confirmed',
  /** На странице отправилась форма отклика. */
  'form_submit',
  /** После отправки появился текст вида «спасибо за отклик». */
  'success_page',
  /** Сам сайт показывает метку «вы уже откликались». */
  'site_marker',
  /** Запись добавлена пользователем вручную. */
  'manual_entry',
] as const;
export type SubmissionSignal = (typeof SUBMISSION_SIGNALS)[number];

export const submissionSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  applicationId: z.string().nullable().default(null),
  at: z.number(),
  source: z.enum(SUBMISSION_SOURCES).default('manual'),
  signal: z.enum(SUBMISSION_SIGNALS).default('user_confirmed'),
  url: z.string().default(''),
  hostname: z.string().default(''),
  /** Снимок данных вакансии на момент отклика: вакансию могут снять с публикации. */
  title: z.string().default(''),
  company: z.string().default(''),
  score: z.number().nullable().default(null),
  note: z.string().default(''),
});
export type SubmissionRecord = z.infer<typeof submissionSchema>;

export interface SubmissionSummary {
  today: number;
  week: number;
  month: number;
  total: number;
  /** Сколько записей добавила автоматика — видно, насколько ей можно верить. */
  auto: number;
}
