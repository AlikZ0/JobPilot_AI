import type { z } from 'zod';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';

/**
 * Достаёт первый полный JSON-объект из ответа модели. Модели иногда оборачивают
 * JSON в блок кода или добавляют фразу, поэтому объект ищется по балансу скобок,
 * а не берётся вся строка целиком.
 */
export function extractJsonObject(text: string): string | null {
  const withoutFences = text
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = withoutFences.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < withoutFences.length; i++) {
    const char = withoutFences[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return withoutFences.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Разбирает и валидирует ответ модели. Ничто из ответа не выполняется и не
 * принимается на веру: данными он становится только после проверки Zod-схемой.
 */
export function parseAIJson<S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    throw new JobPilotError(
      ERROR_CODES.AI_INVALID_RESPONSE,
      'В ответе AI не оказалось JSON-объекта.',
      { hint: 'Попробуйте другую модель — небольшие модели часто игнорируют требование JSON.' },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new JobPilotError(
      ERROR_CODES.AI_INVALID_RESPONSE,
      'Ответ AI не является корректным JSON.',
      { hint: 'Повторите попытку или уменьшите temperature в настройках.' },
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new JobPilotError(
      ERROR_CODES.AI_INVALID_RESPONSE,
      `Ответ AI не соответствует ожидаемой схеме (${issues}).`,
      { hint: 'Обычно помогает более сильная модель.' },
    );
  }
  return result.data;
}
