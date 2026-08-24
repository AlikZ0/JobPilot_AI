import type { ChatMessage, FormAnalysisInput } from '../types';
import { JSON_RULES, clampBlock, jsonSchemaBlock } from './shared';

const SCHEMA = `{
  "fields": [
    {
      "fieldId": string,          // скопируй fieldId, который тебе передали
      "fieldType": string,        // одно из допустимых значений ниже
      "profilePath": string|null, // например "personal.firstName", "salary.expected", "links.github"
      "confidence": number,       // 0..1 — оценивай честно, низкая уверенность это нормально
      "reason": string
    }
  ]
}`;

const ALLOWED = `Допустимые значения fieldType: first_name, last_name, full_name, email, phone, country, city,
address, linkedin, github, portfolio, website, current_company, current_position, desired_position,
experience_years, current_salary, expected_salary, notice_period, available_from, education, skills,
cover_letter, resume, work_authorization, visa_sponsorship, relocation, remote_preference,
employment_type, languages, gender, ethnicity, veteran_status, disability_status, referral_source,
consent, open_question, unknown.

Допустимые значения profilePath: personal.firstName, personal.lastName, personal.fullName, personal.email,
personal.phone, location.country, location.city, links.linkedin, links.github, links.portfolio,
professional.currentPosition, professional.desiredPosition, professional.experienceYears,
professional.summary, salary.current, salary.expected, preferences.noticePeriodWeeks,
preferences.availableFrom, preferences.workAuthorization, preferences.requiresVisaSponsorship,
location.willingToRelocate, skills.list, languages.list или null.`;

export function buildFormAnalysisPrompt(input: FormAnalysisInput): ChatMessage[] {
  const system = `Ты классифицируешь неизвестные поля формы отклика на вакансию, чтобы
ассистент мог предзаполнить их из сохранённого профиля.
Ты никогда не придумываешь значения — ты только сопоставляешь поле с путём в профиле.
Демографические вопросы (пол, этническая принадлежность, статус ветерана или
инвалидности) нужно так и классифицировать и ставить profilePath = null: они
никогда не заполняются автоматически.
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

  const user = `Отклик на вакансию «${input.jobTitle}» в компании «${input.company}».

ПОЛЯ ФОРМЫ (JSON):
${clampBlock(JSON.stringify(fields), 12_000)}

Верни JSON-объект.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
