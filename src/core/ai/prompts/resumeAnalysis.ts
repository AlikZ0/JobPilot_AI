import type { ChatMessage, ResumeAnalysisInput } from '../types';
import { JSON_RULES, clampBlock, jsonSchemaBlock, languageInstruction } from './shared';

const SCHEMA = `{
  "skills": [{"name": string, "category": "frontend"|"backend"|"devops"|"database"|"other"}],
  "experience": [{"company": string, "position": string, "period": string, "technologies": string[]}],
  "education": [{"institution": string, "degree": string}],
  "languages": [{"name": string, "level": string}],
  "achievements": string[],
  "totalExperienceYears": number|null,
  "notes": string
}`;

export function buildResumeAnalysisPrompt(input: ResumeAnalysisInput): ChatMessage[] {
  const system = `Ты извлекаешь структурированные факты из резюме, чтобы пользователь
мог их просмотреть и импортировать. Извлекай ТОЛЬКО то, что буквально написано в
документе. Никогда не домысливай навык, работодателя, дату или степень, которых
там нет. Если чего-то в резюме не сказано — оставь поле пустым.
${JSON_RULES}
${languageInstruction(input.language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `ТЕКСТ РЕЗЮМЕ:
${clampBlock(input.resumeText, 14_000)}

Верни JSON-объект.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
