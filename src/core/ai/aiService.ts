import type { AIProviderId, AITask } from '@/types/ai';
import type { ProviderConfig, Settings } from '@/types/settings';
import { providerConfigSchema } from '@/types/settings';
import type { AIProvider, ProviderCredentials, TaskContext, TaskResult } from './types';
import { getProvider } from '@/providers/registry';
import { getApiKey } from './keyStore';
import { getSettings } from '@/database/repositories/settingsRepository';
import { countRequestsToday, recordUsage } from '@/database/repositories/usageRepository';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';
import { createId } from '@/utils/id';
import { createLogger } from '@/utils/logger';

const log = createLogger('ai');

export interface ResolvedProvider {
  provider: AIProvider;
  ctx: TaskContext;
  providerId: AIProviderId;
}

/** Approximate token count used only for the local cost estimate. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export function estimateCost(
  settings: Settings,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const { estimatedInputCostPer1k, estimatedOutputCostPer1k } = settings.costControl;
  if (!estimatedInputCostPer1k && !estimatedOutputCostPer1k) return null;
  return (
    (promptTokens / 1000) * estimatedInputCostPer1k +
    (completionTokens / 1000) * estimatedOutputCostPer1k
  );
}

/**
 * Resolves the active provider plus its credentials. This is the only place an
 * API key is read, and it happens exclusively in the service worker.
 */
export async function resolveProvider(
  settings: Settings,
  signal?: AbortSignal,
): Promise<ResolvedProvider> {
  if (!settings.privacy.allowAIRequests) {
    throw new JobPilotError(ERROR_CODES.AI_DISABLED, 'AI requests are disabled.', {
      hint: 'Enable "Allow AI requests" in Settings → Privacy.',
    });
  }
  const providerId: AIProviderId = settings.aiMode === 'cloud' ? 'cloud' : settings.activeProvider;
  const provider = getProvider(providerId);
  const config: ProviderConfig = providerConfigSchema.parse(settings.providers[providerId] ?? {});
  const apiKey = providerId === 'cloud' ? '' : await getApiKey(providerId);

  if (providerId !== 'cloud' && !apiKey) {
    throw new JobPilotError(
      ERROR_CODES.AI_NOT_CONFIGURED,
      `No API key stored for ${provider.label}.`,
      { hint: 'Add your key in Settings → AI provider.' },
    );
  }
  const model = config.model || provider.suggestedModels[0] || '';
  if (!model) {
    throw new JobPilotError(ERROR_CODES.AI_NOT_CONFIGURED, 'No model selected.', {
      hint: 'Choose a model in Settings → AI provider.',
    });
  }
  const baseUrl =
    providerId === 'cloud'
      ? config.baseUrl || settings.cloudEndpoint
      : config.baseUrl || provider.defaultBaseUrl;

  const credentials: ProviderCredentials = { apiKey, baseUrl, model };
  return {
    provider,
    providerId,
    ctx: { credentials, config, ...(signal ? { signal } : {}) },
  };
}

async function assertWithinBudget(settings: Settings): Promise<void> {
  const limit = settings.costControl.dailyRequestLimit;
  if (limit === 0) return;
  const used = await countRequestsToday();
  if (used >= limit) {
    throw new JobPilotError(
      ERROR_CODES.AI_BUDGET_EXCEEDED,
      `Daily AI request limit reached (${used}/${limit}).`,
      { hint: 'Raise the limit in Settings → Cost control.' },
    );
  }
}

/**
 * Runs one AI task with budget enforcement and usage accounting. Errors are
 * recorded too, so the usage screen shows failures instead of hiding them.
 */
export async function runAITask<T>(
  task: AITask,
  execute: (resolved: ResolvedProvider) => Promise<TaskResult<T>>,
  options: { settings?: Settings; signal?: AbortSignal } = {},
): Promise<TaskResult<T>> {
  const settings = options.settings ?? (await getSettings());
  await assertWithinBudget(settings);
  const resolved = await resolveProvider(settings, options.signal);
  const startedAt = Date.now();

  try {
    const result = await execute(resolved);
    await recordUsage({
      id: createId('use'),
      at: startedAt,
      task,
      providerId: resolved.providerId,
      model: result.model,
      promptChars: result.promptChars,
      completionChars: result.completionChars,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      estimatedCostUsd: estimateCost(
        settings,
        result.promptTokens ?? estimateTokens(result.promptChars),
        result.completionTokens ?? estimateTokens(result.completionChars),
      ),
      durationMs: result.durationMs,
      ok: true,
      errorCode: null,
    });
    return result;
  } catch (error) {
    const code = error instanceof JobPilotError ? error.code : ERROR_CODES.AI_REQUEST_FAILED;
    await recordUsage({
      id: createId('use'),
      at: startedAt,
      task,
      providerId: resolved.providerId,
      model: resolved.ctx.credentials.model,
      promptChars: 0,
      completionChars: 0,
      promptTokens: null,
      completionTokens: null,
      estimatedCostUsd: null,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorCode: code,
    });
    log.warn(`AI task ${task} failed`, { code });
    throw error;
  }
}

/** Settings → "is AI usable right now" check used across the UI. */
export async function isAIAvailable(settings?: Settings): Promise<boolean> {
  try {
    await resolveProvider(settings ?? (await getSettings()));
    return true;
  } catch {
    return false;
  }
}

export async function testProviderConnection(): Promise<{ ok: boolean; message: string }> {
  const settings = await getSettings();
  const resolved = await resolveProvider(settings);
  const started = Date.now();
  const response = await resolved.provider.chat(
    {
      messages: [
        { role: 'system', content: 'Reply with the JSON object {"ok":true} and nothing else.' },
        { role: 'user', content: 'ping' },
      ],
      json: true,
      temperature: 0,
      maxTokens: 64,
      timeoutMs: Math.min(resolved.ctx.config.timeoutMs, 30_000),
    },
    resolved.ctx.credentials,
  );
  const ok = response.text.includes('"ok"') || response.text.trim().length > 0;
  return {
    ok,
    message: ok
      ? `${resolved.provider.label} responded in ${Date.now() - started}ms using ${response.model}.`
      : `${resolved.provider.label} returned an empty response.`,
  };
}
