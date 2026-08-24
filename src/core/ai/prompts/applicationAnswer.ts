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
  "missingInformation": string[],  // what the user must confirm or supply
  "usedProfileFacts": string[]     // the profile facts you relied on
}`;

export function buildApplicationAnswerPrompt(input: ApplicationQuestionInput): ChatMessage[] {
  const { profile, job, question, maxLength, language } = input;
  const system = `You draft answers to job application questions on behalf of the user.
If the question asks for a factual claim that the profile cannot support
(a certificate, a specific employer, a security clearance, a salary the user has
not stated, willingness to do something not in preferences), you must NOT answer
"yes" or invent it: set status to "needs_user_confirmation", explain what is
missing in missingInformation, and write the best answer you can that contains
no unverifiable claim.
${TRUTHFULNESS_RULES}
${JSON_RULES}
${languageInstruction(language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `USER PROFILE (JSON):
${clampBlock(JSON.stringify(profile), 6000)}

JOB: ${job.title} at ${job.company}
JOB SUMMARY: ${clampBlock(job.description, 2500)}

QUESTION: ${clampBlock(question, 1000)}
${maxLength ? `The answer must be at most ${maxLength} characters.` : ''}

Return the JSON object now.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
