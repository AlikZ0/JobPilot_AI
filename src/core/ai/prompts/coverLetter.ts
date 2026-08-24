import type { ChatMessage, CoverLetterInput } from '../types';
import {
  JSON_RULES,
  TRUTHFULNESS_RULES,
  clampBlock,
  jsonSchemaBlock,
  languageInstruction,
} from './shared';

const SCHEMA = `{
  "subject": string,             // short email subject line
  "body": string,                // the letter itself, 150-320 words, plain text with \\n line breaks
  "tone": string,
  "unverifiedClaims": string[],  // anything you could NOT ground in the profile and therefore left out
  "status": "ok" | "needs_user_confirmation"
}`;

export function buildCoverLetterPrompt(input: CoverLetterInput): ChatMessage[] {
  const { profile, job, tone, language, extraInstructions } = input;
  const system = `You write concise, specific cover letters for software engineers.
Ground every sentence in the USER PROFILE. If the posting asks for something the
profile does not contain, do not claim it — list it in "unverifiedClaims" and set
status to "needs_user_confirmation".
Never use placeholders like [Company] — use the real values given to you.
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

Requested tone: ${tone}
${extraInstructions ? `Extra instructions from the user: ${clampBlock(extraInstructions, 600)}` : ''}

Return the JSON object now.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
