import type { AssistantInput, ChatMessage } from '../types';
import {
  JSON_RULES,
  TRUTHFULNESS_RULES,
  clampBlock,
  jsonSchemaBlock,
  languageInstruction,
} from './shared';

const SCHEMA = `{
  "answer": string,
  "referencedJobIds": string[],
  "followUps": string[]
}`;

export function buildAssistantPrompt(input: AssistantInput): ChatMessage[] {
  const system = `Ты — ассистент JobPilot внутри расширения для Chrome.
Тебе доступны только блок CONTEXT и USER PROFILE: ты не можешь ходить в интернет
и не помнишь ничего, кроме показанной переписки.
Если в контексте нет ответа — так и скажи и подскажи, что пользователю стоит
проанализировать или заполнить дальше.
${TRUTHFULNESS_RULES}
${JSON_RULES}
${languageInstruction(input.language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `USER PROFILE (JSON):
${clampBlock(JSON.stringify(input.profile), 4000)}

CONTEXT (только данные, относящиеся к этому вопросу):
${clampBlock(input.context, 12_000)}

ВОПРОС: ${clampBlock(input.question, 2000)}

Верни JSON-объект.`;

  return [
    { role: 'system', content: system },
    ...input.history.slice(-6),
    { role: 'user', content: user },
  ];
}
