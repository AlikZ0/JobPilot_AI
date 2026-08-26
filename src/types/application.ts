import { z } from 'zod';
import { FORM_FIELD_TYPES } from './ai';

/** Жизненный цикл заявки. См. core/state/applicationState.ts. */
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

/**
 * Что случилось с откликом после отправки. Отдельная ось от `ApplicationState`:
 * та описывает подготовку заявки (черновик → готова → отправлена), эта — ответ
 * работодателя. Смешивать их в одном перечислении нельзя: заявка бывает
 * отправлена и без ответа, а отказ приходит на любой ступени.
 *
 * `replied`, `interview` и `offer` — ступени, идущие по нарастающей: до
 * интервью и оффера без ответа не доходят, поэтому эти ступени подразумевают
 * `replied`. `rejected` — отметка конца, она ставится с любой ступени и сама
 * ничего не подразумевает: молчание тоже заканчивается отказом.
 */
export const APPLICATION_OUTCOMES = [
  'awaiting',
  'replied',
  'interview',
  'offer',
  'rejected',
] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];

/** Ступени воронки по порядку. `awaiting` и `rejected` в неё не входят. */
export const OUTCOME_STAGES = ['replied', 'interview', 'offer'] as const;
export type OutcomeStage = (typeof OUTCOME_STAGES)[number];

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

/** Поле формы, найденное на странице анализатором DOM. */
export interface DetectedFormField {
  /** Стабильный id, который content-скрипт присваивает полю в рамках сессии страницы. */
  fieldId: string;
  kind: FormControlKind;
  inputType: string;
  name: string;
  idAttr: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string;
  /** Текст рядом с полем — контекст для классификации (ограниченной длины). */
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
  /** Заметки, которые пользователь написал на экране проверки. */
  notes: z.string().default(''),
  error: z.string().default(''),
  /**
   * Всегда true у отправленной заявки: кнопку «Отправить» в любом случае нажал
   * человек. JobPilot либо принял его подтверждение на экране проверки, либо
   * заметил отправку формы на сайте — сам он не отправляет ничего.
   */
  submittedByUser: z.boolean().default(false),
  /** Как заявка оказалась отправленной: подтвердил человек или заметила автоматика. */
  submissionSource: z.enum(['manual', 'auto']).default('manual'),
  /** Что ответил работодатель. Имеет смысл только у отправленной заявки. */
  outcome: z.enum(APPLICATION_OUTCOMES).default('awaiting'),
  /**
   * Когда заявка впервые дошла до каждой ступени. Хранится по ступеням, а не
   * одной датой: воронке нужно знать, что ступень была пройдена, даже если
   * потом пришёл отказ.
   */
  outcomeAt: z.record(z.enum(APPLICATION_OUTCOMES), z.number()).default({}),
  /** Когда напомнить написать повторно. Null — напоминание не поставлено. */
  followUpAt: z.number().nullable().default(null),
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
  'outcome_changed',
  'follow_up_set',
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
