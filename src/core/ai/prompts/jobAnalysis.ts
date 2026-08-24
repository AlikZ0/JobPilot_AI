import type { JobAnalysisInput } from '../types';
import type { ChatMessage } from '../types';
import {
  JSON_RULES,
  TRUTHFULNESS_RULES,
  clampBlock,
  jsonSchemaBlock,
  languageInstruction,
} from './shared';

const SCHEMA = `{
  "matchedSkills": string[],        // technologies required by the job that the profile really has
  "missingSkills": string[],        // technologies required by the job that the profile lacks
  "bonusSkills": string[],          // profile technologies that are a plus but not required
  "mandatorySkills": string[],      // technologies the posting marks as must-have
  "detectedSeniority": "intern"|"junior"|"mid"|"senior"|"lead"|"principal"|"director"|"unknown",
  "requiredExperienceYears": number|null,
  "languageRequirements": [{"language": string, "level": string}],
  "responsibilitiesAlignment": number, // 0..1, how well the daily work matches the profile
  "cultureNotes": string,
  "redFlags": [{"code": "unrealistic_requirements"|"very_broad_responsibilities"|"suspicious_salary"|"unpaid_position"|"commission_only"|"relocation_required"|"language_mismatch"|"visa_restriction"|"mandatory_tech_missing"|"vague_description"|"other", "severity": "low"|"medium"|"high", "detail": string}],
  "reasoning": string,              // max 3 short paragraphs
  "summary": string,                // one sentence
  "confidence": number              // 0..1
}`;

export function buildJobAnalysisPrompt(input: JobAnalysisInput): ChatMessage[] {
  const { profile, job, language } = input;
  const system = `You analyze job postings for a software engineer.
You do NOT produce a match percentage — the application computes the score itself from your findings.
Report only what the posting and the profile actually say.
${TRUTHFULNESS_RULES}
${JSON_RULES}
${languageInstruction(language)}
${jsonSchemaBlock(SCHEMA)}`;

  const user = `USER PROFILE (JSON):
${clampBlock(JSON.stringify(profile), 6000)}

JOB POSTING (JSON):
${clampBlock(
  JSON.stringify({
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode,
    employmentType: job.employmentType,
    seniority: job.seniority,
    salary: job.salary,
    technologies: job.technologies,
    requirements: job.requirements,
    responsibilities: job.responsibilities,
    languageRequirements: job.languageRequirements,
    description: job.description,
  }),
  9000,
)}

Return the JSON object now.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
