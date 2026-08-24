import { describe, expect, it } from 'vitest';
import {
  scoreJob,
  computePriority,
  parseRequiredYears,
  detectRedFlags,
} from '@/core/scoring/engine';
import { matchSkills, classifyJobSkills } from '@/core/scoring/skillMatcher';
import { SCORE_WEIGHTS, TOTAL_WEIGHT, bandForScore } from '@/core/scoring/weights';
import { makeProfile } from '../fixtures/profile';
import { makeJob } from '../fixtures/jobs';

describe('score weights', () => {
  it('sum to exactly 100', () => {
    expect(TOTAL_WEIGHT).toBe(100);
    expect(SCORE_WEIGHTS.technicalSkills).toBe(40);
  });

  it('map scores to the documented bands', () => {
    expect(bandForScore(95)).toBe('strong_match');
    expect(bandForScore(90)).toBe('strong_match');
    expect(bandForScore(89)).toBe('good_match');
    expect(bandForScore(75)).toBe('good_match');
    expect(bandForScore(74)).toBe('potential_match');
    expect(bandForScore(60)).toBe('potential_match');
    expect(bandForScore(59)).toBe('weak_match');
    expect(bandForScore(40)).toBe('weak_match');
    expect(bandForScore(39)).toBe('not_suitable');
    expect(bandForScore(0)).toBe('not_suitable');
  });
});

describe('skill matching', () => {
  it('separates mandatory from optional technologies', () => {
    const { mandatory, optional } = classifyJobSkills(makeJob());
    expect(mandatory).toContain('TypeScript');
    expect(mandatory).toContain('Docker');
    expect(optional).toContain('AWS');
    expect(mandatory).not.toContain('AWS');
  });

  it('counts implied skills as owned (Nuxt implies Vue)', () => {
    const profile = makeProfile({
      skills: [{ name: 'Nuxt', category: 'frontend', primary: true }],
    });
    const job = makeJob({ technologies: ['Vue'], requirements: ['Vue experience'] });
    const match = matchSkills(job, profile);
    expect(match.matched).toContain('Vue');
  });

  it('reports missing must-have technologies', () => {
    const profile = makeProfile({
      skills: [{ name: 'Node.js', category: 'backend', primary: true }],
    });
    const match = matchSkills(makeJob(), profile);
    expect(match.missingMandatory).toContain('TypeScript');
    expect(match.missingMandatory).toContain('Docker');
  });
});

describe('deterministic scoring', () => {
  it('scores a strong match highly and explains every component', () => {
    const result = scoreJob({ job: makeJob(), profile: makeProfile() });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.band === 'good_match' || result.band === 'strong_match').toBe(true);
    for (const part of Object.values(result.breakdown)) {
      expect(part.earned).toBeLessThanOrEqual(part.max);
      expect(part.earned).toBeGreaterThanOrEqual(0);
      expect(part.detail.length).toBeGreaterThan(0);
    }
    const total = Object.values(result.breakdown).reduce((sum, part) => sum + part.earned, 0);
    expect(Math.round(total)).toBe(result.score);
  });

  it('scores an unrelated job low', () => {
    const job = makeJob({
      title: 'Senior Salesforce Administrator',
      description:
        'We need a Salesforce admin with Apex and Visualforce experience. On-site only in Tokyo. Japanese N1 required.',
      requirements: ['5+ years of Salesforce (must have)', 'Apex required', 'Japanese N1'],
      responsibilities: ['Administer Salesforce'],
      technologies: [],
      languageRequirements: ['Japanese N1'],
      location: 'Tokyo, Japan',
      city: 'Tokyo',
      country: 'Japan',
      workMode: 'office',
      salary: { min: 900, max: null, currency: 'USD', period: 'month', raw: '900 USD' },
    });
    const result = scoreJob({ job, profile: makeProfile() });
    expect(result.score).toBeLessThan(60);
    expect(result.languageMatch).toBe(false);
    expect(result.locationMatch).toBe(false);
    expect(result.salaryMatch).toBe(false);
  });

  it('never lets AI findings invent a skill the profile does not have', () => {
    const result = scoreJob({
      job: makeJob(),
      profile: makeProfile(),
      findings: {
        matchedSkills: ['Kubernetes', 'Rust'],
        missingSkills: [],
        bonusSkills: [],
        mandatorySkills: [],
        detectedSeniority: 'senior',
        requiredExperienceYears: 5,
        languageRequirements: [],
        responsibilitiesAlignment: 0.9,
        cultureNotes: '',
        redFlags: [],
        reasoning: '',
        summary: '',
        confidence: 0.9,
      },
    });
    expect(result.matchedSkills).not.toContain('Kubernetes');
    expect(result.matchedSkills).not.toContain('Rust');
  });

  it('is deterministic for the same inputs', () => {
    const job = makeJob();
    const profile = makeProfile();
    const first = scoreJob({ job, profile });
    const second = scoreJob({ job, profile });
    expect(first.score).toBe(second.score);
    expect(first.breakdown).toEqual(second.breakdown);
  });

  it('penalises a missing must-have technology', () => {
    const withDocker = scoreJob({ job: makeJob(), profile: makeProfile() });
    const profileWithoutDocker = makeProfile({
      skills: makeProfile().skills.filter((skill) => skill.name !== 'Docker'),
    });
    const withoutDocker = scoreJob({ job: makeJob(), profile: profileWithoutDocker });
    expect(withoutDocker.score).toBeLessThan(withDocker.score);
    expect(withoutDocker.redFlags.map((flag) => flag.code)).toContain('mandatory_tech_missing');
  });
});

describe('required years parsing', () => {
  it.each([
    ['5+ years of experience', 5],
    ['at least 3 years of commercial experience', 3],
    ['3-5 years of experience with Node', 3],
    ['minimum of 7 years', 7],
    ['no experience requirement', null],
  ])('parses %s', (text, expected) => {
    expect(parseRequiredYears(text)).toBe(expected);
  });
});

describe('red flags', () => {
  it('flags unpaid and commission-only roles', () => {
    const job = makeJob({
      description: 'This is an unpaid internship with commission-only bonuses.',
      requirements: [],
      responsibilities: [],
    });
    const flags = detectRedFlags(job, matchSkills(job, makeProfile()));
    const codes = flags.map((flag) => flag.code);
    expect(codes).toContain('unpaid_position');
    expect(codes).toContain('commission_only');
  });
});

describe('priority', () => {
  it('raises priority for high scoring remote jobs', () => {
    const job = { ...makeJob(), score: 92 };
    expect(computePriority(job, makeProfile())).toBe('critical');
  });

  it('keeps weak matches low', () => {
    const job = { ...makeJob(), score: 30, description: '' };
    expect(computePriority(job, makeProfile())).toBe('low');
  });
});
