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

describe('извлечение JSON', () => {
  it('достаёт объект из ответа в блоке кода', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('игнорирует текст вокруг объекта', () => {
    expect(extractJsonObject('Sure! {"a":{"b":2}} Hope that helps.')).toBe('{"a":{"b":2}}');
  });

  it('корректно обрабатывает скобки внутри строк', () => {
    expect(extractJsonObject('{"a":"} not the end {"}')).toBe('{"a":"} not the end {"}');
  });

  it('возвращает null, если объекта нет', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });
});

describe('валидация схемой', () => {
  it('принимает полный набор выводов по вакансии', () => {
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

  it('подставляет значения по умолчанию для неполного ответа', () => {
    const parsed = parseAIJson('{"matchedSkills":["Vue"]}', aiJobFindingsSchema);
    expect(parsed.missingSkills).toEqual([]);
    expect(parsed.responsibilitiesAlignment).toBe(0.5);
  });

  it('отклоняет ответ с неверными типами', () => {
    expect(() => parseAIJson('{"responsibilitiesAlignment":"high"}', aiJobFindingsSchema)).toThrow(
      /не соответствует ожидаемой схеме/,
    );
  });

  it('отклоняет неизвестный код красного флага', () => {
    expect(() =>
      parseAIJson(
        '{"redFlags":[{"code":"aliens","severity":"low","detail":"x"}]}',
        aiJobFindingsSchema,
      ),
    ).toThrow(/схеме/);
  });

  it('отклоняет некорректный JSON', () => {
    expect(() => parseAIJson('{oops}', aiJobFindingsSchema)).toThrow(/не является корректным JSON/);
  });

  it('отклоняет ответ, в котором JSON нет вовсе', () => {
    expect(() => parseAIJson('Я не могу с этим помочь.', aiJobFindingsSchema)).toThrow(
      /не оказалось JSON-объекта/,
    );
  });

  it('проверяет схемы остальных задач', () => {
    expect(parseAIJson('{"body":"Hello"}', coverLetterSchema).status).toBe('ok');
    expect(
      parseAIJson('{"answer":"yes","status":"needs_user_confirmation"}', applicationAnswerSchema)
        .missingInformation,
    ).toEqual([]);
    expect(parseAIJson('{"fields":[]}', aiFormAnalysisSchema).fields).toEqual([]);
    expect(parseAIJson('{"answer":"hi"}', assistantReplySchema).followUps).toEqual([]);
  });

  it('не принимает слишком длинные массивы', () => {
    const huge = JSON.stringify({ matchedSkills: Array.from({ length: 200 }, () => 'X') });
    expect(() => parseAIJson(huge, aiJobFindingsSchema)).toThrow(/схеме/);
  });
});

describe('проекция профиля', () => {
  it('никогда не содержит контактных данных', () => {
    const projection = buildAIProfile(makeProfile());
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('alex@example.com');
    expect(serialized).not.toContain('+1 555 0100');
    expect(serialized).not.toContain('Alex');
    expect(projection.skills.frontend).toContain('Vue');
  });

  it('может опустить опыт работы, если пользователь запретил', () => {
    const projection = buildAIProfile(makeProfile(), { includeExperience: false });
    expect(projection.experience).toEqual([]);
    expect(projection.education).toEqual([]);
  });
});

describe('промпты', () => {
  it('запрещают выдумывать балл и требуют только JSON', () => {
    const [system] = buildJobAnalysisPrompt({
      profile: buildAIProfile(makeProfile()),
      job: makeJob(),
      language: 'English',
    });
    expect(system!.content).toMatch(/НЕ выставляешь процент совпадения/);
    expect(system!.content).toMatch(/одним JSON-объектом/);
    expect(system!.content).toMatch(/Ничего не выдумывай/);
  });

  it('несут правила достоверности в каждую задачу с текстом', () => {
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
    expect(letter[0]!.content).toMatch(/ПРАВИЛА ДОСТОВЕРНОСТИ/);
    expect(answer[0]!.content).toMatch(/needs_user_confirmation/);
  });

  it('удерживает описание вакансии в бюджете промпта', () => {
    const job = makeJob({ description: 'x'.repeat(50_000) });
    const [, user] = buildJobAnalysisPrompt({
      profile: buildAIProfile(makeProfile()),
      job,
      language: 'English',
    });
    expect(user!.content.length).toBeLessThan(20_000);
  });
});

describe('оценка токенов', () => {
  it('считает примерно четыре символа на токен', () => {
    expect(estimateTokens(400)).toBe(100);
  });
});
