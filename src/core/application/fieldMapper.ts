import type { DetectedFormField, FieldMapping } from '@/types/application';
import type { FormFieldType } from '@/types/ai';
import type { UserProfile } from '@/types/profile';
import { readProfilePath, type ProfilePath } from './profilePaths';

interface Rule {
  type: FormFieldType;
  path: ProfilePath | null;
  /** Matched against label + name + id + placeholder + aria-label. */
  match: RegExp;
  /** Patterns that veto the rule, e.g. "email" must not match "emailed you". */
  reject?: RegExp;
  autocomplete?: string[];
  confidence: number;
}

/**
 * Deterministic rules run before any AI call, in order. The first match wins,
 * so more specific rules must come first.
 */
export const FIELD_RULES: Rule[] = [
  {
    type: 'email',
    path: 'personal.email',
    match: /\b(e[-\s]?mail|email address|correo|почта)\b/i,
    autocomplete: ['email'],
    confidence: 0.97,
  },
  {
    type: 'phone',
    path: 'personal.phone',
    match: /\b(phone|mobile|telephone|tel\.?|cell|телефон)\b/i,
    autocomplete: ['tel', 'tel-national'],
    confidence: 0.95,
  },
  {
    type: 'first_name',
    path: 'personal.firstName',
    match: /\b(first[\s_-]?name|given[\s_-]?name|forename|имя)\b/i,
    autocomplete: ['given-name'],
    confidence: 0.96,
  },
  {
    type: 'last_name',
    path: 'personal.lastName',
    match: /\b(last[\s_-]?name|surname|family[\s_-]?name|фамилия)\b/i,
    autocomplete: ['family-name'],
    confidence: 0.96,
  },
  {
    type: 'full_name',
    path: 'personal.fullName',
    match: /\b(full[\s_-]?name|your name|name)\b/i,
    reject: /\b(company|employer|university|school|file|user ?name|first|last|middle)\b/i,
    autocomplete: ['name'],
    confidence: 0.88,
  },
  {
    type: 'linkedin',
    path: 'links.linkedin',
    match: /\blinked ?in\b/i,
    confidence: 0.97,
  },
  {
    type: 'github',
    path: 'links.github',
    match: /\b(github|git hub)\b/i,
    confidence: 0.97,
  },
  {
    type: 'portfolio',
    path: 'links.portfolio',
    match: /\b(portfolio|personal (web)?site|website|homepage|blog)\b/i,
    confidence: 0.85,
  },
  {
    type: 'city',
    path: 'location.city',
    match: /\b(city|town|локация|город)\b/i,
    autocomplete: ['address-level2'],
    confidence: 0.9,
  },
  {
    type: 'country',
    path: 'location.country',
    match: /\b(country|страна)\b/i,
    autocomplete: ['country', 'country-name'],
    confidence: 0.92,
  },
  {
    type: 'current_company',
    path: null,
    match: /\b(current (employer|company)|company name|employer)\b/i,
    confidence: 0.8,
  },
  {
    type: 'current_position',
    path: 'professional.currentPosition',
    match: /\b(current (title|position|role)|job title|current job)\b/i,
    confidence: 0.9,
  },
  {
    type: 'desired_position',
    path: 'professional.desiredPosition',
    match: /\b(desired (position|role|title)|position applied for|role you)\b/i,
    confidence: 0.85,
  },
  {
    type: 'expected_salary',
    path: 'salary.expected',
    match:
      /\b(expected|desired|requested|target)\b.{0,20}\b(salary|compensation|rate|pay)\b|\bsalary expectation/i,
    confidence: 0.93,
  },
  {
    type: 'current_salary',
    path: 'salary.current',
    match: /\bcurrent\b.{0,20}\b(salary|compensation|pay)\b/i,
    confidence: 0.9,
  },
  {
    type: 'experience_years',
    path: 'professional.experienceYears',
    match:
      /\b(years? of (relevant |professional |commercial )?experience|experience \(years\)|total experience)\b/i,
    confidence: 0.9,
  },
  {
    type: 'notice_period',
    path: 'preferences.noticePeriodWeeks',
    match: /\bnotice period\b/i,
    confidence: 0.88,
  },
  {
    type: 'available_from',
    path: 'preferences.availableFrom',
    match: /\b(available (from|start)|start date|earliest start)\b/i,
    confidence: 0.85,
  },
  {
    type: 'work_authorization',
    path: 'preferences.workAuthorization',
    match: /\b(work (authorization|permit|eligibility)|legally authorized|right to work)\b/i,
    confidence: 0.7,
  },
  {
    type: 'visa_sponsorship',
    path: 'preferences.requiresVisaSponsorship',
    match: /\b(visa|sponsorship)\b/i,
    confidence: 0.7,
  },
  {
    type: 'relocation',
    path: 'location.willingToRelocate',
    match: /\b(relocat)/i,
    confidence: 0.8,
  },
  {
    type: 'skills',
    path: 'skills.list',
    match: /\b(skills|technologies|tech stack)\b/i,
    confidence: 0.75,
  },
  {
    type: 'languages',
    path: 'languages.list',
    match: /\b(languages? (you )?(speak|spoken)|language skills)\b/i,
    confidence: 0.8,
  },
  {
    type: 'cover_letter',
    path: null,
    match:
      /\b(cover letter|motivation|why (do )?you|message to (the )?(hiring|employer)|additional information)\b/i,
    confidence: 0.85,
  },
  {
    type: 'resume',
    path: null,
    match: /\b(resume|cv|curriculum)\b/i,
    confidence: 0.9,
  },
  {
    type: 'referral_source',
    path: null,
    match: /\b(how did you (hear|find)|referral|source)\b/i,
    confidence: 0.8,
  },
  // Demographic questions are recognised so they are explicitly NOT filled.
  { type: 'gender', path: null, match: /\b(gender|sex)\b/i, confidence: 0.9 },
  { type: 'ethnicity', path: null, match: /\b(ethnicity|race|hispanic)\b/i, confidence: 0.9 },
  { type: 'veteran_status', path: null, match: /\bveteran\b/i, confidence: 0.9 },
  { type: 'disability_status', path: null, match: /\bdisabilit/i, confidence: 0.9 },
  {
    type: 'consent',
    path: null,
    match: /\b(consent|agree|gdpr|privacy policy|terms)\b/i,
    confidence: 0.85,
  },
];

/** Field types that must never be auto-filled, even at high confidence. */
export const NEVER_AUTOFILL: FormFieldType[] = [
  'gender',
  'ethnicity',
  'veteran_status',
  'disability_status',
  'consent',
  'resume',
  'unknown',
];

export const AUTOFILL_CONFIDENCE_THRESHOLD = 0.8;

function haystackOf(field: DetectedFormField): string {
  return [field.label, field.name, field.idAttr, field.placeholder, field.ariaLabel]
    .filter(Boolean)
    .join(' ');
}

export interface ClassifiedField {
  fieldType: FormFieldType;
  profilePath: ProfilePath | null;
  confidence: number;
  reason: string;
}

/** Deterministic classification of a single field. */
export function classifyField(field: DetectedFormField): ClassifiedField {
  const haystack = haystackOf(field);
  const autocomplete = field.autocomplete.toLowerCase();

  for (const rule of FIELD_RULES) {
    const byAutocomplete = rule.autocomplete?.includes(autocomplete) ?? false;
    const byText = rule.match.test(haystack) && !(rule.reject?.test(haystack) ?? false);
    if (!byAutocomplete && !byText) continue;
    return {
      fieldType: rule.type,
      profilePath: rule.path,
      confidence: byAutocomplete ? Math.min(0.99, rule.confidence + 0.03) : rule.confidence,
      reason: byAutocomplete ? `autocomplete="${autocomplete}"` : `matched "${rule.match.source}"`,
    };
  }

  // Long free-text controls without a rule are open questions for the AI.
  if (field.kind === 'textarea' || (field.maxLength ?? 0) > 300) {
    return {
      fieldType: 'open_question',
      profilePath: null,
      confidence: 0.5,
      reason: 'free-text field with no recognised label',
    };
  }
  return { fieldType: 'unknown', profilePath: null, confidence: 0, reason: 'no rule matched' };
}

function decisionFor(
  classified: ClassifiedField,
  value: string,
  requireConfirmation: boolean,
): FieldMapping['decision'] {
  if (NEVER_AUTOFILL.includes(classified.fieldType)) return 'skipped';
  if (!value) return 'skipped';
  if (classified.confidence < AUTOFILL_CONFIDENCE_THRESHOLD) return 'needs_confirmation';
  return requireConfirmation ? 'needs_confirmation' : 'auto';
}

/**
 * Builds the deterministic part of a fill plan. Fields that stay `unknown` are
 * returned separately so the caller can optionally ask the AI about them.
 */
export function buildDeterministicPlan(
  fields: DetectedFormField[],
  profile: UserProfile,
  options: { requireConfirmation: boolean },
): { mappings: FieldMapping[]; unknownFields: DetectedFormField[] } {
  const mappings: FieldMapping[] = [];
  const unknownFields: DetectedFormField[] = [];

  for (const field of fields) {
    const classified = classifyField(field);
    if (classified.fieldType === 'unknown' || classified.fieldType === 'open_question') {
      unknownFields.push(field);
      if (classified.fieldType === 'unknown') continue;
    }
    const value = classified.profilePath ? readProfilePath(profile, classified.profilePath) : '';
    mappings.push({
      fieldId: field.fieldId,
      fieldType: classified.fieldType,
      profilePath: classified.profilePath,
      value,
      confidence: classified.confidence,
      source: 'deterministic',
      decision: decisionFor(classified, value, options.requireConfirmation),
      label: field.label || field.placeholder || field.name || field.fieldId,
      reason: classified.reason,
    });
  }
  return { mappings, unknownFields };
}

/** Merges AI suggestions for fields the deterministic pass could not resolve. */
export function mergeAIMappings(
  base: FieldMapping[],
  aiFields: {
    fieldId: string;
    fieldType: FormFieldType;
    profilePath: string | null;
    confidence: number;
    reason: string;
  }[],
  fields: DetectedFormField[],
  profile: UserProfile,
  options: { requireConfirmation: boolean },
): FieldMapping[] {
  const byId = new Map(base.map((mapping) => [mapping.fieldId, mapping]));
  const fieldById = new Map(fields.map((field) => [field.fieldId, field]));

  for (const suggestion of aiFields) {
    const field = fieldById.get(suggestion.fieldId);
    if (!field) continue;
    const existing = byId.get(suggestion.fieldId);
    // Deterministic wins whenever it was confident.
    if (existing && existing.confidence >= AUTOFILL_CONFIDENCE_THRESHOLD) continue;

    const path = suggestion.profilePath ?? null;
    const value = path ? readProfilePath(profile, path) : '';
    const classified: ClassifiedField = {
      fieldType: suggestion.fieldType,
      profilePath: path as ProfilePath | null,
      confidence: suggestion.confidence,
      reason: suggestion.reason || 'AI classification',
    };
    byId.set(suggestion.fieldId, {
      fieldId: suggestion.fieldId,
      fieldType: suggestion.fieldType,
      profilePath: path,
      value,
      confidence: suggestion.confidence,
      source: 'ai',
      decision: decisionFor(classified, value, options.requireConfirmation),
      label: field.label || field.placeholder || field.name || field.fieldId,
      reason: classified.reason,
    });
  }
  return [...byId.values()];
}
