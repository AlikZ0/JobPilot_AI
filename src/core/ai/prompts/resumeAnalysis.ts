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
  const system = `You extract structured facts from a CV so the user can review and
import them. Extract ONLY what the document literally contains. Never infer a
skill, employer, date or degree that is not written down. Leave fields empty
when the CV does not state them.
${JSON_RULES}
${languageInstruction(input.language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `CV TEXT:
${clampBlock(input.resumeText, 14_000)}

Return the JSON object now.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
