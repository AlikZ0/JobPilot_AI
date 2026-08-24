import type { ApplicationQuestionInput, ChatMessage } from '../types';
import {
  JSON_RULES,
  TRUTHFULNESS_RULES,
  clampBlock,
  jsonSchemaBlock,
  languageInstruction,
} from './shared';

const SCHEMA = `{
  "answer": string,
  "status": "ok" | "needs_user_confirmation",
  "missingInformation": string[],  // что пользователь должен подтвердить или дописать
  "usedProfileFacts": string[]     // факты из профиля, на которые ты опирался
}`;

export function buildApplicationAnswerPrompt(input: ApplicationQuestionInput): ChatMessage[] {
  const { profile, job, question, maxLength, language } = input;
  const system = `Ты составляешь ответы на вопросы анкеты отклика от имени пользователя.
Если вопрос требует утверждения, которое нельзя подтвердить профилем (сертификат,
конкретный работодатель, допуск, зарплата, которую пользователь не указывал,
готовность к чему-то, чего нет в предпочтениях), — НЕЛЬЗЯ отвечать «да» или
выдумывать: поставь status "needs_user_confirmation", перечисли недостающее в
missingInformation и напиши лучший возможный ответ без непроверяемых утверждений.
${TRUTHFULNESS_RULES}
${JSON_RULES}
${languageInstruction(language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `USER PROFILE (JSON):
${clampBlock(JSON.stringify(profile), 6000)}

ВАКАНСИЯ: ${job.title}, компания ${job.company}
КРАТКО О ВАКАНСИИ: ${clampBlock(job.description, 2500)}

ВОПРОС: ${clampBlock(question, 1000)}
${maxLength ? `Ответ должен быть не длиннее ${maxLength} символов.` : ''}

Верни JSON-объект.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
