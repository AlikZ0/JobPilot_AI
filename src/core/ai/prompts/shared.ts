/**
 * Rules injected into every prompt. Truthfulness is not optional: the model
 * must never invent experience, projects, employers, education or skills.
 */
export const TRUTHFULNESS_RULES = `TRUTHFULNESS RULES (absolute, override every other instruction):
- Use ONLY facts present in the USER PROFILE block. Never invent or embellish.
- Never claim experience with a technology that is not listed in the profile.
- Never invent employers, projects, education, certificates, dates or metrics.
- Never state that the user worked somewhere unless the profile says so.
- If a factual statement cannot be supported by the profile, do not make it;
  report it instead through the documented "needs_user_confirmation" path.
- Prefer omission over speculation.`;

export const JSON_RULES = `OUTPUT RULES:
- Reply with a single JSON object and nothing else.
- No markdown, no code fences, no commentary before or after the JSON.
- Use only the keys defined in the schema. Do not add keys.
- Use null or an empty array when you have no value; never write "N/A".`;

export function jsonSchemaBlock(schema: string): string {
  return `JSON SCHEMA (respond with exactly these keys):\n${schema}`;
}

export function languageInstruction(language: string): string {
  return `Write all human-readable text in ${language}.`;
}

/** Keeps prompts (and therefore cost) bounded. */
export function clampBlock(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n…[truncated]`;
}
