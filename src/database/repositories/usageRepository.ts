import { getDb } from '../db';
import type { AIUsageRecord } from '@/types/ai';
import { startOfDay } from '@/utils/time';

export async function recordUsage(record: AIUsageRecord): Promise<void> {
  await getDb().aiUsage.put(record);
}

export async function countRequestsToday(now = Date.now()): Promise<number> {
  const from = startOfDay(now);
  return getDb().aiUsage.where('at').aboveOrEqual(from).count();
}

export interface UsageSummary {
  requests: number;
  failed: number;
  promptChars: number;
  completionChars: number;
  estimatedCostUsd: number;
  byTask: Record<string, number>;
}

export async function summarizeUsage(sinceMs: number): Promise<UsageSummary> {
  const rows = await getDb().aiUsage.where('at').aboveOrEqual(sinceMs).toArray();
  const summary: UsageSummary = {
    requests: rows.length,
    failed: rows.filter((r) => !r.ok).length,
    promptChars: 0,
    completionChars: 0,
    estimatedCostUsd: 0,
    byTask: {},
  };
  for (const row of rows) {
    summary.promptChars += row.promptChars;
    summary.completionChars += row.completionChars;
    summary.estimatedCostUsd += row.estimatedCostUsd ?? 0;
    summary.byTask[row.task] = (summary.byTask[row.task] ?? 0) + 1;
  }
  return summary;
}

export async function clearUsage(): Promise<void> {
  await getDb().aiUsage.clear();
}
