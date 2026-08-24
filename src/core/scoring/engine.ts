import type { AIJobFindings, JobAnalysis, RedFlag, ScoreBreakdown } from '@/types/ai';
import type { ExtractedJob, Job } from '@/types/job';
import type { Seniority, UserProfile } from '@/types/profile';
import { SENIORITY_LEVELS } from '@/types/profile';
import { languageLevelIndex, toMonthly } from '@/core/extraction/normalize';
import { canonicalizeTech } from '@/core/extraction/techDictionary';
import { normalizeToken, unique } from '@/utils/text';
import { matchSkills, profileSkillSet, type SkillMatch } from './skillMatcher';
import { SCORE_WEIGHTS, bandForScore } from './weights';

export interface ScoringInput {
  job: ExtractedJob;
  profile: UserProfile;
  /** Необязательные качественные выводы AI; скоринг работает и без них. */
  findings?: AIJobFindings | null;
}

export interface ScoringOutput {
  score: number;
  band: JobAnalysis['band'];
  breakdown: ScoreBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  bonusSkills: string[];
  seniorityMatch: boolean;
  salaryMatch: boolean;
  locationMatch: boolean;
  languageMatch: boolean;
  experienceMatch: boolean;
  redFlags: RedFlag[];
}

const seniorityIndex = (value: string): number => SENIORITY_LEVELS.indexOf(value as Seniority);

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Вливает выводы AI в детерминированное сопоставление: модель может добавить
 * навыки, распознанные в тексте, но не может перевести в «отсутствующие» тот
 * навык, который уже подтверждён словарём.
 */
function mergeSkillFindings(
  base: SkillMatch,
  profile: UserProfile,
  findings: AIJobFindings | null | undefined,
): SkillMatch {
  if (!findings) return base;
  const owned = profileSkillSet(profile);
  const matched = new Set(base.matched.map(canonicalizeTech));
  const missing = new Set(base.missing.map(canonicalizeTech));

  for (const raw of findings.matchedSkills) {
    const skill = canonicalizeTech(raw);
    if (!owned.has(normalizeToken(skill))) continue; // never trust an unbacked claim
    matched.add(skill);
    missing.delete(skill);
  }
  for (const raw of findings.missingSkills) {
    const skill = canonicalizeTech(raw);
    if (matched.has(skill) || owned.has(normalizeToken(skill))) continue;
    missing.add(skill);
  }
  const missingMandatory = unique([
    ...base.missingMandatory,
    ...findings.mandatorySkills
      .map(canonicalizeTech)
      .filter((skill) => !owned.has(normalizeToken(skill))),
  ]);

  const required = unique([...matched, ...missing]);
  const mandatoryTotal = unique([
    ...base.missingMandatory,
    ...findings.mandatorySkills.map(canonicalizeTech),
  ]);
  const mandatoryMatched = mandatoryTotal.filter((skill) => owned.has(normalizeToken(skill)));

  return {
    matched: [...matched],
    missing: [...missing],
    bonus: unique([...base.bonus, ...findings.bonusSkills.map(canonicalizeTech)]).filter(
      (skill) => !required.includes(skill),
    ),
    missingMandatory,
    required,
    coverage: required.length === 0 ? 0 : matched.size / required.length,
    mandatoryCoverage:
      mandatoryTotal.length === 0 ? 1 : mandatoryMatched.length / mandatoryTotal.length,
  };
}

function scoreTechnical(match: SkillMatch): { earned: number; detail: string } {
  const max = SCORE_WEIGHTS.technicalSkills;
  if (match.required.length === 0) {
    return {
      earned: max * 0.5,
      detail: 'No technologies detected in the posting — scored as neutral.',
    };
  }
  // Основной вес — за покрытие; за незакрытые обязательные навыки штрафуем.
  const coverageScore = match.coverage * max * 0.75;
  const mandatoryScore = match.mandatoryCoverage * max * 0.25;
  const earned = Math.max(0, Math.min(max, coverageScore + mandatoryScore));
  const detail = `${match.matched.length}/${match.required.length} required technologies${
    match.missingMandatory.length ? `, missing must-have: ${match.missingMandatory.join(', ')}` : ''
  }`;
  return { earned: round(earned), detail };
}

function scoreExperience(
  profile: UserProfile,
  findings: AIJobFindings | null | undefined,
  job: ExtractedJob,
): { earned: number; detail: string; match: boolean } {
  const max = SCORE_WEIGHTS.experience;
  const required =
    findings?.requiredExperienceYears ??
    parseRequiredYears(`${job.requirements.join('\n')}\n${job.description}`);
  const have = profile.professional.experienceYears;
  if (required === null) {
    return {
      earned: max * 0.8,
      detail: `No explicit requirement; you have ${have} years.`,
      match: true,
    };
  }
  if (have >= required) {
    return { earned: max, detail: `${have} years vs ${required} required.`, match: true };
  }
  const ratio = required === 0 ? 1 : have / required;
  const earned = Math.max(0, max * Math.max(0, ratio - 0.15));
  return {
    earned: round(earned),
    detail: `${have} years vs ${required} required.`,
    match: ratio >= 0.8,
  };
}

/** Читает «5+ years», «at least 3 years», «3-5 years of experience». */
export function parseRequiredYears(text: string): number | null {
  const patterns = [
    /(\d{1,2})\s*\+?\s*(?:-|–|to)\s*(\d{1,2})\s*(?:\+)?\s*years?/i,
    /(?:at least|minimum(?: of)?|min\.?)\s*(\d{1,2})\s*years?/i,
    /(\d{1,2})\s*\+\s*years?/i,
    /(\d{1,2})\s*years? of (?:commercial |professional |relevant )?experience/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const first = Number(match[1]);
    if (!Number.isFinite(first)) continue;
    return first;
  }
  return null;
}

function scoreSeniority(
  job: ExtractedJob,
  profile: UserProfile,
  findings: AIJobFindings | null | undefined,
): { earned: number; detail: string; match: boolean } {
  const max = SCORE_WEIGHTS.seniority;
  const jobLevel =
    findings?.detectedSeniority && findings.detectedSeniority !== 'unknown'
      ? findings.detectedSeniority
      : job.seniority;
  if (jobLevel === 'unknown') {
    return { earned: max * 0.7, detail: 'Seniority not stated in the posting.', match: true };
  }
  const jobIndex = seniorityIndex(jobLevel);
  const profileIndex = seniorityIndex(profile.professional.seniority);
  const distance = Math.abs(jobIndex - profileIndex);
  const earned =
    distance === 0 ? max : distance === 1 ? max * 0.7 : distance === 2 ? max * 0.35 : 0;
  return {
    earned: round(earned),
    detail: `Posting is ${jobLevel}; your profile is ${profile.professional.seniority}.`,
    match: distance <= 1,
  };
}

function scoreLocation(
  job: ExtractedJob,
  profile: UserProfile,
): { earned: number; detail: string; match: boolean } {
  const max = SCORE_WEIGHTS.location;
  const wantsRemote = profile.preferences.workModes.includes('remote');
  const modeAccepted =
    job.workMode === 'unknown' || profile.preferences.workModes.includes(job.workMode);

  if (job.workMode === 'remote' && wantsRemote) {
    return { earned: max, detail: 'Remote role and you prefer remote.', match: true };
  }
  const sameCountry =
    Boolean(profile.location.country) &&
    normalizeToken(job.country || job.location).includes(normalizeToken(profile.location.country));
  const sameCity =
    Boolean(profile.location.city) &&
    normalizeToken(job.city || job.location).includes(normalizeToken(profile.location.city));

  if (sameCity && modeAccepted) {
    return { earned: max, detail: `Same city (${profile.location.city}).`, match: true };
  }
  if (sameCountry && modeAccepted) {
    return {
      earned: round(max * 0.85),
      detail: `Same country (${profile.location.country}).`,
      match: true,
    };
  }
  if (job.workMode === 'remote') {
    return {
      earned: round(max * 0.7),
      detail: 'Remote role, but you did not list remote as preferred.',
      match: modeAccepted,
    };
  }
  if (profile.location.willingToRelocate) {
    const listed =
      profile.location.relocationCountries.length === 0 ||
      profile.location.relocationCountries.some((country) =>
        normalizeToken(job.country || job.location).includes(normalizeToken(country)),
      );
    return {
      earned: round(max * (listed ? 0.6 : 0.3)),
      detail: listed
        ? 'Different location, but you are open to relocation.'
        : 'Location is outside your relocation list.',
      match: listed,
    };
  }
  if (!job.location) {
    return { earned: round(max * 0.5), detail: 'No location stated.', match: true };
  }
  return { earned: 0, detail: `Location mismatch (${job.location}).`, match: false };
}

function scoreSalary(
  job: ExtractedJob,
  profile: UserProfile,
): { earned: number; detail: string; match: boolean } {
  const max = SCORE_WEIGHTS.salary;
  const expected = profile.salary.expected ?? profile.salary.minimumAcceptable;
  if (job.salary.min === null && job.salary.max === null) {
    return { earned: round(max * 0.5), detail: 'Salary not disclosed.', match: true };
  }
  if (!expected) {
    return {
      earned: round(max * 0.7),
      detail: 'No salary expectation set in your profile.',
      match: true,
    };
  }
  const wantMonthly = toMonthly(expected, profile.salary.period);
  const offerTop = toMonthly(job.salary.max ?? job.salary.min ?? 0, job.salary.period);
  const offerBottom = toMonthly(job.salary.min ?? job.salary.max ?? 0, job.salary.period);
  if (wantMonthly === null || offerTop === null || offerBottom === null) {
    return {
      earned: round(max * 0.5),
      detail: 'Salary period unclear — not compared.',
      match: true,
    };
  }
  const currencyMismatch =
    Boolean(job.salary.currency) &&
    Boolean(profile.salary.currency) &&
    job.salary.currency !== profile.salary.currency;
  if (currencyMismatch) {
    return {
      earned: round(max * 0.5),
      detail: `Offer in ${job.salary.currency}, expectation in ${profile.salary.currency} — not compared.`,
      match: true,
    };
  }
  if (offerTop >= wantMonthly) {
    const generous = offerBottom >= wantMonthly;
    return {
      earned: generous ? max : round(max * 0.85),
      detail: generous
        ? 'Whole range meets your expectation.'
        : 'Top of the range meets your expectation.',
      match: true,
    };
  }
  const ratio = offerTop / wantMonthly;
  return {
    earned: round(Math.max(0, max * (ratio - 0.5) * 2)),
    detail: `Offer tops out at ${Math.round(ratio * 100)}% of your expectation.`,
    match: ratio >= 0.9,
  };
}

function scoreLanguage(
  job: ExtractedJob,
  profile: UserProfile,
  findings: AIJobFindings | null | undefined,
): { earned: number; detail: string; match: boolean } {
  const max = SCORE_WEIGHTS.language;
  const required =
    findings?.languageRequirements.map((entry) => `${entry.language} ${entry.level}`.trim()) ??
    job.languageRequirements;
  if (required.length === 0) {
    return { earned: max, detail: 'No language requirement stated.', match: true };
  }
  let satisfied = 0;
  const unmet: string[] = [];
  for (const requirement of required) {
    const [languageName = ''] = requirement.split(/\s+/);
    const owned = profile.languages.find((language) =>
      normalizeToken(language.name).startsWith(normalizeToken(languageName)),
    );
    if (!owned) {
      unmet.push(requirement);
      continue;
    }
    const requiredLevel = languageLevelIndex(requirement);
    const ownedLevel = languageLevelIndex(owned.level);
    if (requiredLevel < 0 || ownedLevel >= requiredLevel) satisfied += 1;
    else unmet.push(requirement);
  }
  const earned = (satisfied / required.length) * max;
  return {
    earned: round(earned),
    detail: unmet.length ? `Unmet: ${unmet.join(', ')}` : `Meets ${required.join(', ')}`,
    match: unmet.length === 0,
  };
}

function scoreResponsibilities(
  job: ExtractedJob,
  profile: UserProfile,
  findings: AIJobFindings | null | undefined,
): { earned: number; detail: string } {
  const max = SCORE_WEIGHTS.responsibilities;
  if (findings) {
    return {
      earned: round(findings.responsibilitiesAlignment * max),
      detail: `AI alignment estimate: ${Math.round(findings.responsibilitiesAlignment * 100)}%.`,
    };
  }
  if (job.responsibilities.length === 0) {
    return { earned: round(max * 0.6), detail: 'Responsibilities not listed.' };
  }
  // Детерминированный запасной вариант: сколько строк с обязанностями упоминают
  // то, что пользователь действительно знает.
  const owned = profileSkillSet(profile);
  const hits = job.responsibilities.filter((line) =>
    [...owned].some((skill) => skill.length > 2 && normalizeToken(line).includes(skill)),
  ).length;
  const ratio = hits / job.responsibilities.length;
  return {
    earned: round(Math.min(max, max * (0.4 + ratio))),
    detail: `${hits}/${job.responsibilities.length} responsibilities touch your stack.`,
  };
}

function scoreOther(
  job: ExtractedJob,
  profile: UserProfile,
  redFlags: RedFlag[],
): { earned: number; detail: string } {
  const max = SCORE_WEIGHTS.other;
  let earned = max;
  const notes: string[] = [];

  const typeAccepted =
    job.employmentType === 'unknown' ||
    profile.preferences.employmentTypes.includes(job.employmentType);
  if (!typeAccepted) {
    earned -= max * 0.4;
    notes.push(`employment type ${job.employmentType} not in your preferences`);
  }
  const highSeverity = redFlags.filter((flag) => flag.severity === 'high').length;
  const mediumSeverity = redFlags.filter((flag) => flag.severity === 'medium').length;
  earned -= Math.min(max * 0.6, highSeverity * max * 0.3 + mediumSeverity * max * 0.12);
  if (highSeverity || mediumSeverity) notes.push(`${redFlags.length} red flag(s)`);

  const dealbreaker = profile.preferences.dealbreakers.find(
    (item) => item.length > 3 && normalizeToken(job.description).includes(normalizeToken(item)),
  );
  if (dealbreaker) {
    earned -= max * 0.5;
    notes.push(`dealbreaker mentioned: "${dealbreaker}"`);
  }

  if (job.extractionQuality < 0.4) notes.push('low extraction quality');
  return {
    earned: round(Math.max(0, Math.min(max, earned))),
    detail: notes.length ? notes.join('; ') : 'No issues detected.',
  };
}

/** Красные флаги, вычисляемые детерминированно по самому тексту вакансии. */
export function detectRedFlags(job: ExtractedJob, match: SkillMatch): RedFlag[] {
  const flags: RedFlag[] = [];
  const text = `${job.title}\n${job.description}`.toLowerCase();

  if (/unpaid|no salary|without payment|equity only|for exposure/.test(text)) {
    flags.push({
      code: 'unpaid_position',
      severity: 'high',
      detail: 'The posting mentions unpaid work.',
    });
  }
  if (/commission[- ]only|100% commission/.test(text)) {
    flags.push({
      code: 'commission_only',
      severity: 'high',
      detail: 'Compensation appears to be commission only.',
    });
  }
  if (match.required.length >= 15) {
    flags.push({
      code: 'unrealistic_requirements',
      severity: 'medium',
      detail: `${match.required.length} technologies are requested for a single role.`,
    });
  }
  if (job.responsibilities.length >= 14) {
    flags.push({
      code: 'very_broad_responsibilities',
      severity: 'low',
      detail: `${job.responsibilities.length} distinct responsibilities are listed.`,
    });
  }
  if (job.salary.min !== null && job.salary.max !== null && job.salary.max > job.salary.min * 3) {
    flags.push({
      code: 'suspicious_salary',
      severity: 'low',
      detail: 'The advertised salary range is unusually wide.',
    });
  }
  if (/relocation (is )?(required|mandatory)|must relocate|on[- ]site only/.test(text)) {
    flags.push({
      code: 'relocation_required',
      severity: 'medium',
      detail: 'Relocation or on-site presence appears mandatory.',
    });
  }
  if (
    /no visa sponsorship|we (do not|don.t) sponsor|must (have|hold) (a )?(valid )?(work permit|eu passport)/.test(
      text,
    )
  ) {
    flags.push({
      code: 'visa_restriction',
      severity: 'medium',
      detail: 'The posting restricts candidates by work authorization.',
    });
  }
  if (match.missingMandatory.length > 0) {
    flags.push({
      code: 'mandatory_tech_missing',
      severity: match.missingMandatory.length > 2 ? 'high' : 'medium',
      detail: `Missing must-have technologies: ${match.missingMandatory.join(', ')}.`,
    });
  }
  if (job.description.length < 400) {
    flags.push({
      code: 'vague_description',
      severity: 'low',
      detail: 'The job description is very short.',
    });
  }
  return flags;
}

/**
 * Единственное место, где рождается процент совпадения. AI никогда не возвращает
 * балл — он лишь поставляет выводы, которые питают эти детерминированные правила.
 */
export function scoreJob(input: ScoringInput): ScoringOutput {
  const { job, profile, findings } = input;
  const baseMatch = matchSkills(job, profile);
  const match = mergeSkillFindings(baseMatch, profile, findings);

  const deterministicFlags = detectRedFlags(job, match);
  const aiFlags = (findings?.redFlags ?? []).filter(
    (flag) => !deterministicFlags.some((existing) => existing.code === flag.code),
  );
  const redFlags = [...deterministicFlags, ...aiFlags];

  const technical = scoreTechnical(match);
  const experience = scoreExperience(profile, findings, job);
  const seniority = scoreSeniority(job, profile, findings);
  const location = scoreLocation(job, profile);
  const salary = scoreSalary(job, profile);
  const language = scoreLanguage(job, profile, findings);
  const responsibilities = scoreResponsibilities(job, profile, findings);
  const other = scoreOther(job, profile, redFlags);

  const breakdown: ScoreBreakdown = {
    technicalSkills: {
      earned: technical.earned,
      max: SCORE_WEIGHTS.technicalSkills,
      detail: technical.detail,
    },
    experience: {
      earned: experience.earned,
      max: SCORE_WEIGHTS.experience,
      detail: experience.detail,
    },
    seniority: { earned: seniority.earned, max: SCORE_WEIGHTS.seniority, detail: seniority.detail },
    location: { earned: location.earned, max: SCORE_WEIGHTS.location, detail: location.detail },
    salary: { earned: salary.earned, max: SCORE_WEIGHTS.salary, detail: salary.detail },
    language: { earned: language.earned, max: SCORE_WEIGHTS.language, detail: language.detail },
    responsibilities: {
      earned: responsibilities.earned,
      max: SCORE_WEIGHTS.responsibilities,
      detail: responsibilities.detail,
    },
    other: { earned: other.earned, max: SCORE_WEIGHTS.other, detail: other.detail },
  };

  const total = Object.values(breakdown).reduce((sum, part) => sum + part.earned, 0);
  const score = Math.max(0, Math.min(100, Math.round(total)));

  return {
    score,
    band: bandForScore(score),
    breakdown,
    matchedSkills: match.matched,
    missingSkills: match.missing,
    bonusSkills: match.bonus,
    seniorityMatch: seniority.match,
    salaryMatch: salary.match,
    locationMatch: location.match,
    languageMatch: language.match,
    experienceMatch: experience.match,
    redFlags,
  };
}

/** балл + зарплата + предпочтения + срочность, как описано в README. */
export function computePriority(
  job: Job | (ExtractedJob & { score: number | null }),
  profile: UserProfile,
): Job['priority'] {
  const score = job.score ?? 0;
  let points = score;
  const expected = profile.salary.expected;
  const offer = toMonthly(job.salary.max ?? job.salary.min ?? 0, job.salary.period);
  const want = expected ? toMonthly(expected, profile.salary.period) : null;
  if (offer && want && offer >= want * 1.15) points += 8;
  if (job.workMode === 'remote' && profile.preferences.workModes.includes('remote')) points += 5;
  if (profile.preferences.employmentTypes.includes(job.employmentType as never)) points += 3;
  if (/urgent|asap|immediate start/i.test(job.description)) points += 4;

  if (points >= 100) return 'critical';
  if (points >= 85) return 'high';
  if (points >= 60) return 'normal';
  return 'low';
}
