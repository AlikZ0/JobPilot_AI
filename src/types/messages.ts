import type { DetectedFormField, FieldMapping, FillPlan, FillResult } from './application';
import type { ExtractedJob, Job, JobSummary } from './job';
import type { JobAnalysis, ResumeAnalysis } from './ai';
import type { ScanProgress } from './scan';
import type { UserProfile } from './profile';
import type { Settings } from './settings';

/**
 * Every cross-context call goes through this union. No magic strings: senders
 * build a message with `msg(...)` and handlers are exhaustively type-checked.
 */
export const MESSAGE_TYPES = {
  // side panel / popup -> background
  PING: 'ping',
  EXTRACT_CURRENT_JOB: 'extract_current_job',
  ANALYZE_CURRENT_JOB: 'analyze_current_job',
  ANALYZE_JOB_BY_ID: 'analyze_job_by_id',
  SAVE_CURRENT_JOB: 'save_current_job',
  DISCOVER_JOBS: 'discover_jobs',
  START_JOB_SCAN: 'start_job_scan',
  STOP_JOB_SCAN: 'stop_job_scan',
  PAUSE_JOB_SCAN: 'pause_job_scan',
  RESUME_JOB_SCAN: 'resume_job_scan',
  GET_SCAN_PROGRESS: 'get_scan_progress',
  PREPARE_APPLICATION: 'prepare_application',
  ANALYZE_APPLICATION_FORM: 'analyze_application_form',
  FILL_APPLICATION_FORM: 'fill_application_form',
  GENERATE_COVER_LETTER: 'generate_cover_letter',
  GENERATE_ANSWER: 'generate_answer',
  ASK_ASSISTANT: 'ask_assistant',
  ANALYZE_RESUME: 'analyze_resume',
  TEST_AI_PROVIDER: 'test_ai_provider',
  REQUEST_HOST_PERMISSION: 'request_host_permission',
  GET_ACTIVE_TAB_CONTEXT: 'get_active_tab_context',
  OPEN_SIDE_PANEL: 'open_side_panel',

  // background -> content
  CONTENT_PING: 'content_ping',
  CONTENT_EXTRACT_JOB: 'content_extract_job',
  CONTENT_EXTRACT_LISTING: 'content_extract_listing',
  CONTENT_ANALYZE_FORM: 'content_analyze_form',
  CONTENT_FILL_FORM: 'content_fill_form',
  CONTENT_HIGHLIGHT_FIELD: 'content_highlight_field',
  CONTENT_PAGE_INFO: 'content_page_info',

  // background -> side panel (broadcast)
  EVENT_SCAN_PROGRESS: 'event_scan_progress',
  EVENT_JOB_UPDATED: 'event_job_updated',
  EVENT_ANALYSIS_READY: 'event_analysis_ready',
  EVENT_DATA_CHANGED: 'event_data_changed',
  EVENT_TOAST: 'event_toast',
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export interface TabTarget {
  tabId?: number;
}

export interface PageInfo {
  url: string;
  title: string;
  hostname: string;
  adapterId: string;
  looksLikeJobPage: boolean;
  looksLikeListingPage: boolean;
  hasApplicationForm: boolean;
  listingCount: number;
}

export interface ToastPayload {
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface AnalyzeResultPayload {
  job: Job;
  analysis: JobAnalysis;
  fromCache: boolean;
}

export interface PrepareApplicationPayload {
  applicationId: string;
  jobId: string;
}

type Def<T extends MessageType, P, R> = { type: T; payload: P; result: R };

export type MessageDefs =
  | Def<typeof MESSAGE_TYPES.PING, undefined, { ok: true; version: string }>
  | Def<typeof MESSAGE_TYPES.EXTRACT_CURRENT_JOB, TabTarget, ExtractedJob>
  | Def<
      typeof MESSAGE_TYPES.ANALYZE_CURRENT_JOB,
      TabTarget & { force?: boolean },
      AnalyzeResultPayload
    >
  | Def<
      typeof MESSAGE_TYPES.ANALYZE_JOB_BY_ID,
      { jobId: string; force?: boolean },
      AnalyzeResultPayload
    >
  | Def<typeof MESSAGE_TYPES.SAVE_CURRENT_JOB, TabTarget, { job: Job }>
  | Def<typeof MESSAGE_TYPES.DISCOVER_JOBS, TabTarget, { jobs: JobSummary[]; listingUrl: string }>
  | Def<
      typeof MESSAGE_TYPES.START_JOB_SCAN,
      TabTarget & { maxJobs?: number; jobs?: JobSummary[] },
      ScanProgress
    >
  | Def<typeof MESSAGE_TYPES.STOP_JOB_SCAN, undefined, ScanProgress>
  | Def<typeof MESSAGE_TYPES.PAUSE_JOB_SCAN, undefined, ScanProgress>
  | Def<typeof MESSAGE_TYPES.RESUME_JOB_SCAN, undefined, ScanProgress>
  | Def<typeof MESSAGE_TYPES.GET_SCAN_PROGRESS, undefined, ScanProgress>
  | Def<typeof MESSAGE_TYPES.PREPARE_APPLICATION, { jobId: string }, PrepareApplicationPayload>
  | Def<
      typeof MESSAGE_TYPES.ANALYZE_APPLICATION_FORM,
      TabTarget & { applicationId: string },
      FillPlan
    >
  | Def<
      typeof MESSAGE_TYPES.FILL_APPLICATION_FORM,
      TabTarget & { applicationId: string; mappings: FieldMapping[] },
      FillResult
    >
  | Def<
      typeof MESSAGE_TYPES.GENERATE_COVER_LETTER,
      { jobId: string; applicationId?: string; tone?: string; instructions?: string },
      { coverLetter: string; unverifiedClaims: string[]; status: 'ok' | 'needs_user_confirmation' }
    >
  | Def<
      typeof MESSAGE_TYPES.GENERATE_ANSWER,
      {
        jobId: string;
        applicationId: string;
        questionId: string;
        question: string;
        maxLength?: number;
      },
      { answer: string; status: 'ok' | 'needs_user_confirmation'; missingInformation: string[] }
    >
  | Def<
      typeof MESSAGE_TYPES.ASK_ASSISTANT,
      {
        prompt: string;
        jobId?: string;
        history: { role: 'user' | 'assistant'; content: string }[];
      },
      { answer: string; referencedJobIds: string[]; followUps: string[] }
    >
  | Def<typeof MESSAGE_TYPES.ANALYZE_RESUME, { text: string }, ResumeAnalysis>
  | Def<typeof MESSAGE_TYPES.TEST_AI_PROVIDER, undefined, { ok: boolean; message: string }>
  | Def<typeof MESSAGE_TYPES.REQUEST_HOST_PERMISSION, { url: string }, { granted: boolean }>
  | Def<
      typeof MESSAGE_TYPES.GET_ACTIVE_TAB_CONTEXT,
      undefined,
      { tabId: number | null; pageInfo: PageInfo | null; hasPermission: boolean }
    >
  | Def<typeof MESSAGE_TYPES.OPEN_SIDE_PANEL, TabTarget, { ok: boolean }>
  | Def<typeof MESSAGE_TYPES.CONTENT_PING, undefined, { ok: true }>
  | Def<typeof MESSAGE_TYPES.CONTENT_EXTRACT_JOB, { maxDescriptionChars: number }, ExtractedJob>
  | Def<typeof MESSAGE_TYPES.CONTENT_EXTRACT_LISTING, undefined, { jobs: JobSummary[] }>
  | Def<typeof MESSAGE_TYPES.CONTENT_ANALYZE_FORM, undefined, { fields: DetectedFormField[] }>
  | Def<typeof MESSAGE_TYPES.CONTENT_FILL_FORM, { mappings: FieldMapping[] }, FillResult>
  | Def<typeof MESSAGE_TYPES.CONTENT_HIGHLIGHT_FIELD, { fieldId: string }, { ok: boolean }>
  | Def<typeof MESSAGE_TYPES.CONTENT_PAGE_INFO, undefined, PageInfo>
  | Def<typeof MESSAGE_TYPES.EVENT_SCAN_PROGRESS, ScanProgress, void>
  | Def<typeof MESSAGE_TYPES.EVENT_JOB_UPDATED, { job: Job }, void>
  | Def<typeof MESSAGE_TYPES.EVENT_ANALYSIS_READY, AnalyzeResultPayload, void>
  | Def<
      typeof MESSAGE_TYPES.EVENT_DATA_CHANGED,
      {
        entity: 'profile' | 'jobs' | 'applications' | 'settings' | 'all';
        profile?: UserProfile;
        settings?: Settings;
      },
      void
    >
  | Def<typeof MESSAGE_TYPES.EVENT_TOAST, ToastPayload, void>;

export type MessageOf<T extends MessageType> = Extract<MessageDefs, { type: T }>;
export type PayloadOf<T extends MessageType> = MessageOf<T>['payload'];
export type ResultOf<T extends MessageType> = MessageOf<T>['result'];

export interface Envelope<T extends MessageType = MessageType> {
  type: T;
  payload: PayloadOf<T>;
  /** Monotonic id used only for log correlation. */
  requestId: string;
}

export type Response<R> = { ok: true; data: R } | { ok: false; error: SerializedError };

export interface SerializedError {
  code: string;
  message: string;
  /** Actionable hint shown in the UI, e.g. "Add an API key in Settings". */
  hint?: string;
  recoverable: boolean;
}
