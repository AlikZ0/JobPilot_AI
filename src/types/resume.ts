import { z } from 'zod';

/**
 * Резюме, подогнанное под конкретную вакансию.
 *
 * Модель возвращает структуру, а не готовый файл: так её вывод можно проверить
 * схемой, отфильтровать по фактам профиля и отрисовать в ATS-совместимом виде.
 */

export const tailoredExperienceSchema = z.object({
  company: z.string().max(120),
  position: z.string().max(120),
  period: z.string().max(60).default(''),
  bullets: z.array(z.string().max(400)).max(8).default([]),
});
export type TailoredExperience = z.infer<typeof tailoredExperienceSchema>;

export const tailoredResumeSchema = z.object({
  /** Заголовок: должность, под которую резюме подогнано. */
  headline: z.string().max(120).default(''),
  summary: z.string().max(1200).default(''),
  /** Плоский список ключевых слов для раздела «Навыки». */
  skills: z.array(z.string().max(60)).max(60).default([]),
  experience: z.array(tailoredExperienceSchema).max(10).default([]),
  education: z
    .array(z.object({ institution: z.string().max(160), degree: z.string().max(120).default('') }))
    .max(6)
    .default([]),
  languages: z.array(z.string().max(60)).max(10).default([]),
  /** Навыки, добавленные из профиля, которых не было в исходном резюме. */
  addedFromProfile: z.array(z.string().max(60)).max(40).default([]),
  /** Требования вакансии, которые нельзя закрыть: их не добавляли. */
  notAdded: z.array(z.string().max(60)).max(40).default([]),
  /** Замечания по совместимости с ATS. */
  atsNotes: z.array(z.string().max(300)).max(15).default([]),
  status: z.enum(['ok', 'needs_user_confirmation']).default('ok'),
});
export type TailoredResume = z.infer<typeof tailoredResumeSchema>;

export const RESUME_SOURCES = ['pdf', 'text'] as const;
export type ResumeSource = (typeof RESUME_SOURCES)[number];

export interface ResumeRecord {
  id: string;
  /**
   * Название варианта: «Frontend (Vue)», «Тимлид». Вариантов может быть
   * несколько — под разные роли ищут по-разному, и одно резюме на всё сразу
   * проигрывает и там, и там. У подогнанных под вакансию копий пусто.
   */
  name: string;
  /** Исходное резюме, из которого всё считается. */
  text: string;
  fileName: string;
  source: ResumeSource;
  pages: number;
  charsPerPage: number;
  createdAt: number;
  updatedAt: number;
  /** Вакансия, под которую подогнано, или null у самого варианта. */
  jobId: string | null;
  /** Вариант, из которого собрана подгонка. Null у самих вариантов. */
  baseId: string | null;
  /** Вариант по умолчанию: с него начинается работа. Такой ровно один. */
  primary: boolean;
  tailored: TailoredResume | null;
  /** Правки пользователя поверх сгенерированного текста. */
  userEdited: boolean;
}
