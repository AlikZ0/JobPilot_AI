import type { z } from 'zod';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';

/**
 * Extracts the first complete JSON object from a model response. Models
 * sometimes wrap JSON in code fences or add a sentence, so we locate the object
 * by brace matching instead of trusting the whole string.
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
 * Parses and validates a model response. Nothing from the model is ever
 * executed or trusted — it only becomes data after passing its Zod schema.
 */
export function parseAIJson<S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    throw new JobPilotError(
      ERROR_CODES.AI_INVALID_RESPONSE,
      'The AI response did not contain a JSON object.',
      { hint: 'Try a different model — some small models ignore JSON instructions.' },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new JobPilotError(
      ERROR_CODES.AI_INVALID_RESPONSE,
      'The AI response was not valid JSON.',
      { hint: 'Try again, or lower the temperature in Settings.' },
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
      `The AI response did not match the expected schema (${issues}).`,
      { hint: 'A more capable model usually fixes this.' },
    );
  }
  return result.data;
}
