import { describe, expect, it } from 'vitest';
import { extractJsonObject, parseAIJson } from '@/core/ai/jsonParse';
import {
  aiFormAnalysisSchema,
  aiJobFindingsSchema,
  applicationAnswerSchema,
  coverLetterSchema,
  assistantReplySchema,
} from '@/types/ai';
import { buildAIProfile } from '@/core/ai/profileProjection';
import { buildJobAnalysisPrompt } from '@/core/ai/prompts/jobAnalysis';
import { buildCoverLetterPrompt } from '@/core/ai/prompts/coverLetter';
import { buildApplicationAnswerPrompt } from '@/core/ai/prompts/applicationAnswer';
import { estimateTokens } from '@/core/ai/aiService';
import { makeProfile } from '../fixtures/profile';
import { makeJob } from '../fixtures/jobs';

describe('JSON extraction', () => {
  it('pulls the object out of a fenced response', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('ignores prose around the object', () => {
    expect(extractJsonObject('Sure! {"a":{"b":2}} Hope that helps.')).toBe('{"a":{"b":2}}');
  });

  it('handles braces inside strings', () => {
    expect(extractJsonObject('{"a":"} not the end {"}')).toBe('{"a":"} not the end {"}');
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });
});

describe('schema validation', () => {
  it('accepts a complete job findings payload', () => {
    const parsed = parseAIJson(
      JSON.stringify({
        matchedSkills: ['Node.js'],
        missingSkills: ['AWS'],
        bonusSkills: [],
        mandatorySkills: ['Node.js'],
        detectedSeniority: 'senior',
        requiredExperienceYears: 5,
        languageRequirements: [{ language: 'English', level: 'B2' }],
        responsibilitiesAlignment: 0.8,
        cultureNotes: '',
        redFlags: [{ code: 'vague_description', severity: 'low', detail: 'short' }],
        reasoning: 'because',
        summary: 'good',
        confidence: 0.9,
      }),
      aiJobFindingsSchema,
    );
    expect(parsed.matchedSkills).toEqual(['Node.js']);
    expect(parsed.detectedSeniority).toBe('senior');
  });

  it('fills defaults for a partial payload', () => {
    const parsed = parseAIJson('{"matchedSkills":["Vue"]}', aiJobFindingsSchema);
    expect(parsed.missingSkills).toEqual([]);
    expect(parsed.responsibilitiesAlignment).toBe(0.5);
  });

  it('rejects a payload with the wrong types', () => {
    expect(() => parseAIJson('{"responsibilitiesAlignment":"high"}', aiJobFindingsSchema)).toThrow(
      /did not match the expected schema/,
    );
  });

  it('rejects an unknown red flag code', () => {
    expect(() =>
      parseAIJson(
        '{"redFlags":[{"code":"aliens","severity":"low","detail":"x"}]}',
        aiJobFindingsSchema,
      ),
    ).toThrow(/schema/);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseAIJson('{oops}', aiJobFindingsSchema)).toThrow(/not valid JSON/);
  });

  it('rejects a response with no JSON at all', () => {
    expect(() => parseAIJson('I cannot help with that.', aiJobFindingsSchema)).toThrow(
      /did not contain a JSON object/,
    );
  });

  it('validates the other task schemas', () => {
    expect(parseAIJson('{"body":"Hello"}', coverLetterSchema).status).toBe('ok');
    expect(
      parseAIJson('{"answer":"yes","status":"needs_user_confirmation"}', applicationAnswerSchema)
        .missingInformation,
    ).toEqual([]);
    expect(parseAIJson('{"fields":[]}', aiFormAnalysisSchema).fields).toEqual([]);
    expect(parseAIJson('{"answer":"hi"}', assistantReplySchema).followUps).toEqual([]);
  });

  it('caps oversized arrays instead of accepting them', () => {
    const huge = JSON.stringify({ matchedSkills: Array.from({ length: 200 }, () => 'X') });
    expect(() => parseAIJson(huge, aiJobFindingsSchema)).toThrow(/schema/);
  });
});

describe('profile projection', () => {
  it('never includes contact details', () => {
    const projection = buildAIProfile(makeProfile());
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('alex@example.com');
    expect(serialized).not.toContain('+1 555 0100');
    expect(serialized).not.toContain('Alex');
    expect(projection.skills.frontend).toContain('Vue');
  });

  it('can omit work history when the user opts out', () => {
    const projection = buildAIProfile(makeProfile(), { includeExperience: false });
    expect(projection.experience).toEqual([]);
    expect(projection.education).toEqual([]);
  });
});

describe('prompts', () => {
  it('forbid score invention and demand JSON only', () => {
    const [system] = buildJobAnalysisPrompt({
      profile: buildAIProfile(makeProfile()),
      job: makeJob(),
      language: 'English',
    });
    expect(system!.content).toMatch(/do NOT produce a match percentage/i);
    expect(system!.content).toMatch(/single JSON object/i);
    expect(system!.content).toMatch(/Never invent/i);
  });

  it('carry the truthfulness rules into every writing task', () => {
    const letter = buildCoverLetterPrompt({
      profile: buildAIProfile(makeProfile()),
      job: makeJob(),
      tone: 'professional',
      language: 'English',
      extraInstructions: '',
    });
    const answer = buildApplicationAnswerPrompt({
      profile: buildAIProfile(makeProfile()),
      job: makeJob(),
      question: 'Do you have a security clearance?',
      maxLength: 500,
      language: 'English',
    });
    expect(letter[0]!.content).toMatch(/TRUTHFULNESS RULES/);
    expect(answer[0]!.content).toMatch(/needs_user_confirmation/);
  });

  it('keeps the job description within the prompt budget', () => {
    const job = makeJob({ description: 'x'.repeat(50_000) });
    const [, user] = buildJobAnalysisPrompt({
      profile: buildAIProfile(makeProfile()),
      job,
      language: 'English',
    });
    expect(user!.content.length).toBeLessThan(20_000);
  });
});

describe('token estimate', () => {
  it('approximates four characters per token', () => {
    expect(estimateTokens(400)).toBe(100);
  });
});
