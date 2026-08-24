import type {
  AIJobFindings,
  AIProviderId,
  AITask,
  AIFormAnalysis,
  ApplicationAnswer,
  AssistantReply,
  CoverLetter,
  ResumeAnalysis,
} from '@/types/ai';
import type { AIProfile } from '@/types/profile';
import type { ExtractedJob } from '@/types/job';
import type { DetectedFormField } from '@/types/application';
import type { ProviderConfig } from '@/types/settings';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Providers that support it are asked for strict JSON output. */
  json: boolean;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
  model: string;
}

export interface ProviderCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface JobAnalysisInput {
  profile: AIProfile;
  job: ExtractedJob;
  language: string;
}

export interface CoverLetterInput {
  profile: AIProfile;
  job: ExtractedJob;
  tone: string;
  language: string;
  extraInstructions: string;
}

export interface FormAnalysisInput {
  fields: DetectedFormField[];
  jobTitle: string;
  company: string;
}

export interface ApplicationQuestionInput {
  profile: AIProfile;
  job: ExtractedJob;
  question: string;
  maxLength: number | null;
  language: string;
}

export interface AssistantInput {
  profile: AIProfile;
  /** Only the slice of data the question actually needs. */
  context: string;
  history: ChatMessage[];
  question: string;
  language: string;
}

export interface ResumeAnalysisInput {
  resumeText: string;
  language: string;
}

/**
 * Every provider implements the same task surface. Task methods are shared in
 * BaseAIProvider; concrete providers only implement `chat` and `describe`.
 */
export interface AIProvider {
  readonly id: AIProviderId;
  readonly label: string;
  readonly defaultBaseUrl: string;
  readonly suggestedModels: string[];
  /** Raw completion call — used by tasks and by the "Test connection" button. */
  chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse>;

  analyzeJob(input: JobAnalysisInput, ctx: TaskContext): Promise<TaskResult<AIJobFindings>>;
  generateCoverLetter(input: CoverLetterInput, ctx: TaskContext): Promise<TaskResult<CoverLetter>>;
  analyzeForm(input: FormAnalysisInput, ctx: TaskContext): Promise<TaskResult<AIFormAnalysis>>;
  generateApplicationAnswer(
    input: ApplicationQuestionInput,
    ctx: TaskContext,
  ): Promise<TaskResult<ApplicationAnswer>>;
  askAssistant(input: AssistantInput, ctx: TaskContext): Promise<TaskResult<AssistantReply>>;
  analyzeResume(input: ResumeAnalysisInput, ctx: TaskContext): Promise<TaskResult<ResumeAnalysis>>;
}

export interface TaskContext {
  credentials: ProviderCredentials;
  config: ProviderConfig;
  signal?: AbortSignal;
}

export interface TaskResult<T> {
  data: T;
  task: AITask;
  model: string;
  promptChars: number;
  completionChars: number;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
}
