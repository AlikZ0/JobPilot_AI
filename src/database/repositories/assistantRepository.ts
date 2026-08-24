import { getDb, type AssistantMessageRecord } from '../db';
import { createId } from '@/utils/id';

export async function appendAssistantMessage(
  role: 'user' | 'assistant',
  content: string,
  jobId: string | null = null,
): Promise<AssistantMessageRecord> {
  const record: AssistantMessageRecord = {
    id: createId('msg'),
    at: Date.now(),
    role,
    content,
    jobId,
  };
  await getDb().assistantMessages.put(record);
  return record;
}

export async function listAssistantMessages(limit = 100): Promise<AssistantMessageRecord[]> {
  const rows = await getDb().assistantMessages.toArray();
  rows.sort((a, b) => a.at - b.at);
  return rows.slice(-limit);
}

export async function clearAssistantMessages(): Promise<void> {
  await getDb().assistantMessages.clear();
}
