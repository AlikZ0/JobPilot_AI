import type { Skill, UserProfile } from '@/types/profile';
import type { ExtractedJob } from '@/types/job';
import {
  canonicalizeTech,
  detectTechnologies,
  expandImplied,
} from '@/core/extraction/techDictionary';
import { normalizeToken, unique } from '@/utils/text';

export interface SkillMatch {
  matched: string[];
  missing: string[];
  bonus: string[];
  /** Обязательные по вакансии навыки, которых нет у пользователя. */
  missingMandatory: string[];
  required: string[];
  coverage: number;
  mandatoryCoverage: number;
}

const MANDATORY_MARKERS =
  /\b(must[- ]have|required|mandatory|essential|strong (knowledge|experience)|proven experience|обязательн)\b/i;
const NICE_TO_HAVE_MARKERS =
  /\b(nice[- ]to[- ]have|plus|bonus|advantage|would be great|preferred|желательн)\b/i;

/** Все канонические навыки, которые пользователь может заявить, включая подразумеваемые. */
export function profileSkillSet(profile: UserProfile): Set<string> {
  const set = new Set<string>();
  for (const skill of profile.skills) {
    for (const implied of expandImplied(skill.name)) set.add(normalizeToken(implied));
  }
  for (const entry of profile.experience) {
    for (const tech of entry.technologies) {
      for (const implied of expandImplied(tech)) set.add(normalizeToken(implied));
    }
  }
  return set;
}

export function primarySkillNames(profile: UserProfile): string[] {
  return profile.skills
    .filter((skill) => skill.primary)
    .map((skill) => canonicalizeTech(skill.name));
}

function requirementLines(job: ExtractedJob): string[] {
  return [...job.requirements, ...job.responsibilities];
}

/**
 * Делит технологии вакансии на обязательные и желательные по формулировке той
 * строки требований, в которой каждая технология встретилась.
 */
export function classifyJobSkills(job: ExtractedJob): { mandatory: string[]; optional: string[] } {
  const mandatory = new Set<string>();
  const optional = new Set<string>();
  const lines = requirementLines(job);

  for (const line of lines) {
    const techs = detectTechnologies(line);
    if (techs.length === 0) continue;
    const isOptional = NICE_TO_HAVE_MARKERS.test(line);
    const isMandatory = !isOptional && MANDATORY_MARKERS.test(line);
    for (const tech of techs) {
      if (isOptional) optional.add(tech);
      else if (isMandatory) mandatory.add(tech);
      else optional.add(tech);
    }
  }

  // Всё, что найдено в описании, но не в пункте списка, считаем желательным.
  for (const tech of job.technologies) {
    if (!mandatory.has(tech)) optional.add(tech);
  }
  for (const tech of mandatory) optional.delete(tech);

  // Если в объявлении нет явного «must have», повышаем технологии из заголовка —
  // они всегда составляют суть роли.
  if (mandatory.size === 0) {
    for (const tech of detectTechnologies(job.title)) {
      mandatory.add(tech);
      optional.delete(tech);
    }
  }
  return { mandatory: [...mandatory], optional: [...optional] };
}

/**
 * Детерминированное сопоставление навыков. Выводы AI могут его дополнить (см.
 * mergeSkillFindings), но не могут убрать совпадение, доказанное словарём.
 */
export function matchSkills(job: ExtractedJob, profile: UserProfile): SkillMatch {
  const owned = profileSkillSet(profile);
  const { mandatory, optional } = classifyJobSkills(job);
  const required = unique([...mandatory, ...optional]);

  const matched: string[] = [];
  const missing: string[] = [];
  const missingMandatory: string[] = [];

  for (const tech of required) {
    if (owned.has(normalizeToken(tech))) matched.push(tech);
    else {
      missing.push(tech);
      if (mandatory.includes(tech)) missingMandatory.push(tech);
    }
  }

  const requiredSet = new Set(required.map(normalizeToken));
  const bonus = profile.skills
    .map((skill: Skill) => canonicalizeTech(skill.name))
    .filter((name) => !requiredSet.has(normalizeToken(name)))
    .slice(0, 40);

  const matchedMandatory = mandatory.filter((tech) => owned.has(normalizeToken(tech)));
  return {
    matched,
    missing,
    bonus,
    missingMandatory,
    required,
    coverage: required.length === 0 ? 0 : matched.length / required.length,
    mandatoryCoverage: mandatory.length === 0 ? 1 : matchedMandatory.length / mandatory.length,
  };
}
