import type { ChatMessage, FormAnalysisInput } from '../types';
import { JSON_RULES, clampBlock, jsonSchemaBlock } from './shared';

const SCHEMA = `{
  "fields": [
    {
      "fieldId": string,        // copy the fieldId you were given
      "fieldType": string,      // one of the allowed field types
      "profilePath": string|null, // e.g. "personal.firstName", "salary.expected", "links.github"
      "confidence": number,     // 0..1 — be honest, low confidence is fine
      "reason": string
    }
  ]
}`;

const ALLOWED = `Allowed fieldType values: first_name, last_name, full_name, email, phone, country, city,
address, linkedin, github, portfolio, website, current_company, current_position, desired_position,
experience_years, current_salary, expected_salary, notice_period, available_from, education, skills,
cover_letter, resume, work_authorization, visa_sponsorship, relocation, remote_preference,
employment_type, languages, gender, ethnicity, veteran_status, disability_status, referral_source,
consent, open_question, unknown.

Allowed profilePath values: personal.firstName, personal.lastName, personal.fullName, personal.email,
personal.phone, location.country, location.city, links.linkedin, links.github, links.portfolio,
professional.currentPosition, professional.desiredPosition, professional.experienceYears,
professional.summary, salary.current, salary.expected, preferences.noticePeriodWeeks,
preferences.availableFrom, preferences.workAuthorization, preferences.requiresVisaSponsorship,
location.willingToRelocate, skills.list, languages.list, or null.`;

export function buildFormAnalysisPrompt(input: FormAnalysisInput): ChatMessage[] {
  const system = `You classify unknown form fields on a job application page so an
assistant can pre-fill them from a stored profile.
Never guess a personal value; you only map a field to a profile path.
Demographic questions (gender, ethnicity, veteran or disability status) must be
classified as such and mapped to profilePath null — they are never auto-filled.
${JSON_RULES}
${ALLOWED}
${jsonSchemaBlock(SCHEMA)}`;

  const fields = input.fields.map((field) => ({
    fieldId: field.fieldId,
    kind: field.kind,
    inputType: field.inputType,
    label: field.label,
    name: field.name,
    placeholder: field.placeholder,
    ariaLabel: field.ariaLabel,
    autocomplete: field.autocomplete,
    required: field.required,
    options: field.options.slice(0, 12).map((option) => option.label),
    context: field.surroundingText.slice(0, 220),
  }));

  const user = `Application for "${input.jobTitle}" at "${input.company}".

FORM FIELDS (JSON):
${clampBlock(JSON.stringify(fields), 12_000)}

Return the JSON object now.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
