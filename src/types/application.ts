import { z } from 'zod';
import { FORM_FIELD_TYPES } from './ai';

/** Lifecycle of an application. See core/state/applicationState.ts. */
export const APPLICATION_STATES = [
  'draft',
  'analyzing',
  'filling',
  'review',
  'ready',
  'submitted',
  'failed',
  'cancelled',
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export const FORM_CONTROL_KINDS = [
  'input',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'contenteditable',
  'file',
] as const;
export type FormControlKind = (typeof FORM_CONTROL_KINDS)[number];

export interface FormFieldOption {
  value: string;
  label: string;
}

/** A control discovered on the page by the DOM form analyzer. */
export interface DetectedFormField {
  /** Stable id assigned by the content script for this page session. */
  fieldId: string;
  kind: FormControlKind;
  inputType: string;
  name: string;
  idAttr: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string;
  /** Nearby text used as context for classification (bounded length). */
  surroundingText: string;
  required: boolean;
  maxLength: number | null;
  options: FormFieldOption[];
  currentValue: string;
  selector: string;
  groupName: string;
  visible: boolean;
}

export const FILL_DECISIONS = ['auto', 'needs_confirmation', 'skipped'] as const;
export type FillDecision = (typeof FILL_DECISIONS)[number];

export const fieldMappingSchema = z.object({
  fieldId: z.string(),
  fieldType: z.enum(FORM_FIELD_TYPES),
  profilePath: z.string().nullable(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['deterministic', 'ai', 'user']),
  decision: z.enum(FILL_DECISIONS),
  label: z.string(),
  reason: z.string().default(''),
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

export interface FillPlan {
  url: string;
  createdAt: number;
  mappings: FieldMapping[];
  unknownFields: DetectedFormField[];
}

export interface FillResultItem {
  fieldId: string;
  filled: boolean;
  reason: string;
}

export interface FillResult {
  filled: number;
  skipped: number;
  items: FillResultItem[];
}

export const applicationQuestionSchema = z.object({
  id: z.string(),
  fieldId: z.string().nullable().default(null),
  question: z.string(),
  answer: z.string().default(''),
  status: z.enum(['pending', 'ok', 'needs_user_confirmation', 'user_edited']).default('pending'),
  missingInformation: z.array(z.string()).default([]),
  maxLength: z.number().nullable().default(null),
});
export type ApplicationQuestion = z.infer<typeof applicationQuestionSchema>;

export const applicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  state: z.enum(APPLICATION_STATES).default('draft'),
  createdAt: z.number(),
  updatedAt: z.number(),
  submittedAt: z.number().nullable().default(null),
  coverLetter: z.string().default(''),
  coverLetterStatus: z.enum(['none', 'generated', 'user_edited']).default('none'),
  unverifiedClaims: z.array(z.string()).default([]),
  questions: z.array(applicationQuestionSchema).default([]),
  fieldMappings: z.array(fieldMappingSchema).default([]),
  attachmentIds: z.array(z.string()).default([]),
  /** Extra notes the user typed on the review screen. */
  notes: z.string().default(''),
  error: z.string().default(''),
  /** Always true: JobPilot never submits without an explicit click. */
  submittedByUser: z.boolean().default(false),
});
export type Application = z.infer<typeof applicationSchema>;

export const APPLICATION_EVENT_TYPES = [
  'created',
  'state_changed',
  'form_analyzed',
  'fields_filled',
  'cover_letter_generated',
  'answer_generated',
  'user_edited',
  'review_opened',
  'submit_confirmed',
  'error',
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  jobId: string;
  at: number;
  type: ApplicationEventType;
  message: string;
  data?: Record<string, unknown>;
}
