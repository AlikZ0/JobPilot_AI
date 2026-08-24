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
  "matchedSkills": string[],        // технологии из вакансии, которые у пользователя реально есть
  "missingSkills": string[],        // технологии из вакансии, которых у пользователя нет
  "bonusSkills": string[],          // технологии пользователя, которые плюс, но не требуются
  "mandatorySkills": string[],      // технологии, помеченные в вакансии как обязательные
  "detectedSeniority": "intern"|"junior"|"mid"|"senior"|"lead"|"principal"|"director"|"unknown",
  "requiredExperienceYears": number|null,
  "languageRequirements": [{"language": string, "level": string}],
  "responsibilitiesAlignment": number, // 0..1, насколько повседневные задачи совпадают с профилем
  "cultureNotes": string,
  "redFlags": [{"code": "unrealistic_requirements"|"very_broad_responsibilities"|"suspicious_salary"|"unpaid_position"|"commission_only"|"relocation_required"|"language_mismatch"|"visa_restriction"|"mandatory_tech_missing"|"vague_description"|"other", "severity": "low"|"medium"|"high", "detail": string}],
  "reasoning": string,              // не более 3 коротких абзацев
  "summary": string,                // одно предложение
  "confidence": number              // 0..1
}`;

export function buildJobAnalysisPrompt(input: JobAnalysisInput): ChatMessage[] {
  const { profile, job, language } = input;
  const system = `Ты анализируешь вакансии для инженера-программиста.
Ты НЕ выставляешь процент совпадения — приложение само считает балл по твоим выводам.
Сообщай только то, что действительно сказано в вакансии и в профиле.
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

Верни JSON-объект.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
