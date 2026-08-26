import type { ChatMessage } from '../types';
import type { AIProfile } from '@/types/profile';
import type { ExtractedJob } from '@/types/job';
import {
  JSON_RULES,
  TRUTHFULNESS_RULES,
  clampBlock,
  jsonSchemaBlock,
  languageInstruction,
} from './shared';

export interface ResumeTailoringInput {
  profile: AIProfile;
  job: ExtractedJob;
  resumeText: string;
  /** Навыки, которые есть в профиле, но отсутствуют в резюме. */
  missingFromResume: string[];
  /** Требования вакансии, которых нет ни в профиле, ни в резюме. */
  notOwned: string[];
  language: string;
}

const SCHEMA = `{
  "headline": string,            // должность, под которую подогнано резюме
  "summary": string,             // 2-4 предложения, без воды и без новых фактов
  "skills": string[],            // ключевые слова для раздела «Навыки»
  "experience": [{"company": string, "position": string, "period": string, "bullets": string[]}],
  "education": [{"institution": string, "degree": string}],
  "languages": string[],
  "addedFromProfile": string[],  // навыки из профиля, которых не было в исходном резюме
  "notAdded": string[],          // требования вакансии, которые ты НЕ добавил, потому что их нет у пользователя
  "atsNotes": string[],          // что ещё мешает машинному разбору резюме
  "status": "ok" | "needs_user_confirmation"
}`;

export function buildResumeTailoringPrompt(input: ResumeTailoringInput): ChatMessage[] {
  const system = `Ты переписываешь резюме инженера под конкретную вакансию так, чтобы его
корректно разобрала ATS (система автоматического разбора откликов).

ЧТО МОЖНО:
- переставлять и переформулировать то, что уже есть в резюме или в профиле;
- добавлять навыки из списка MISSING_FROM_RESUME: они подтверждены профилем,
  пользователь просто забыл их указать;
- использовать формулировки из вакансии, если они описывают реальный опыт.

ЧЕГО НЕЛЬЗЯ:
- добавлять что-либо из списка NOT_OWNED — этого у пользователя нет; перечисли
  их в "notAdded";
- выдумывать работодателей, проекты, годы, цифры и достижения;
- менять даты и названия компаний.

ПРАВИЛА ATS:
- простой текст, одна колонка, никаких таблиц и иконок;
- стандартные разделы и понятные заголовки;
- ключевые слова пиши так же, как в вакансии (и полностью, и аббревиатурой);
- в каждом пункте опыта: что делал, с чем и с каким результатом, если результат
  есть в исходном резюме.
${TRUTHFULNESS_RULES}
${JSON_RULES}
${languageInstruction(input.language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `USER PROFILE (JSON):
${clampBlock(JSON.stringify(input.profile), 5000)}

JOB (JSON):
${clampBlock(
  JSON.stringify({
    title: input.job.title,
    company: input.job.company,
    seniority: input.job.seniority,
    technologies: input.job.technologies,
    requirements: input.job.requirements.slice(0, 20),
    responsibilities: input.job.responsibilities.slice(0, 20),
  }),
  5000,
)}

MISSING_FROM_RESUME (есть у пользователя, но не написано в резюме — можно добавить):
${input.missingFromResume.join(', ') || '—'}

NOT_OWNED (нет ни в профиле, ни в резюме — добавлять запрещено):
${input.notOwned.join(', ') || '—'}

CURRENT_RESUME:
${clampBlock(input.resumeText, 12_000)}

Верни JSON-объект.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
