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
  const system = `You are JobPilot's assistant inside a Chrome extension.
You can only use the CONTEXT block and the USER PROFILE — you have no browsing
ability and no memory beyond the conversation shown to you.
If the context does not contain the answer, say so plainly and suggest what the
user could scan or fill in next.
${TRUTHFULNESS_RULES}
${JSON_RULES}
${languageInstruction(input.language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `USER PROFILE (JSON):
${clampBlock(JSON.stringify(input.profile), 4000)}

CONTEXT (only the data relevant to this question):
${clampBlock(input.context, 12_000)}

QUESTION: ${clampBlock(input.question, 2000)}

Return the JSON object now.`;

  return [
    { role: 'system', content: system },
    ...input.history.slice(-6),
    { role: 'user', content: user },
  ];
}
