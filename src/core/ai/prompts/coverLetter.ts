import type { ChatMessage, CoverLetterInput } from '../types';
import {
  JSON_RULES,
  TRUTHFULNESS_RULES,
  clampBlock,
  jsonSchemaBlock,
  languageInstruction,
} from './shared';

const SCHEMA = `{
  "subject": string,             // короткая тема письма
  "body": string,                // само письмо, 150-320 слов, простой текст с переносами \\n
  "tone": string,
  "unverifiedClaims": string[],  // всё, что НЕ удалось подтвердить профилем и поэтому не вошло в письмо
  "status": "ok" | "needs_user_confirmation"
}`;

export function buildCoverLetterPrompt(input: CoverLetterInput): ChatMessage[] {
  const { profile, job, tone, language, extraInstructions } = input;
  const system = `Ты пишешь короткие и конкретные сопроводительные письма для инженеров.
Каждое предложение должно опираться на USER PROFILE. Если вакансия требует того,
чего в профиле нет, — не приписывай это пользователю: перечисли такое в
"unverifiedClaims" и поставь status "needs_user_confirmation".
Никогда не используй заглушки вроде [Компания] — подставляй реальные значения.
${TRUTHFULNESS_RULES}
${JSON_RULES}
${languageInstruction(language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `USER PROFILE (JSON):
${clampBlock(JSON.stringify(profile), 6000)}

JOB (JSON):
${clampBlock(
  JSON.stringify({
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode,
    technologies: job.technologies,
    requirements: job.requirements.slice(0, 15),
    responsibilities: job.responsibilities.slice(0, 15),
  }),
  5000,
)}

Требуемый тон: ${tone}
${extraInstructions ? `Дополнительные пожелания пользователя: ${clampBlock(extraInstructions, 600)}` : ''}

Верни JSON-объект.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
