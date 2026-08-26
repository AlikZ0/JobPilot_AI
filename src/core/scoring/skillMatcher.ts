import type { Skill, UserProfile } from '@/types/profile';
import type { ExtractedJob } from '@/types/job';
import {
  canonicalizeTech,
  detectTechnologies,
  detectTechnologiesDetailed,
  expandImplied,
  majorVersion,
} from '@/core/extraction/techDictionary';
import { normalizeToken, unique } from '@/utils/text';

/** Навык есть, но версия не та: вакансия просит Vue 3, а в профиле Vue 2. */
export interface VersionMismatch {
  skill: string;
  /** Версия, которую просит вакансия. */
  required: string;
  /** Версии, которые указаны в профиле. */
  have: string[];
}

export interface SkillMatch {
  matched: string[];
  missing: string[];
  bonus: string[];
  /** Обязательные по вакансии навыки, которых нет у пользователя. */
  missingMandatory: string[];
  required: string[];
  /** Совпавшие навыки, у которых расходится мажорная версия. */
  versionMismatches: VersionMismatch[];
  coverage: number;
  mandatoryCoverage: number;
}

/**
 * Версии навыков из профиля: название -> набор мажорных версий. Пустая строка
 * означает «версия не указана» и совпадает с любым требованием.
 */
export function profileSkillVersions(profile: UserProfile): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (name: string, version: string) => {
    const key = normalizeToken(canonicalizeTech(name));
    if (!key) return;
    const set = map.get(key) ?? new Set<string>();
    set.add(majorVersion(version));
    map.set(key, set);
  };
  for (const skill of profile.skills) add(skill.name, skill.version);

  // Технологии из опыта работы — источник послабее: они дополняют список
  // навыков, но не стирают версию, которую пользователь указал явно.
  for (const entry of profile.experience) {
    for (const tech of entry.technologies) {
      const parsed = detectTechnologiesDetailed(tech)[0];
      const name = parsed?.name ?? tech;
      if (map.has(normalizeToken(canonicalizeTech(name)))) continue;
      add(name, parsed?.version ?? '');
    }
  }
  return map;
}

/** Версии, которые требует вакансия: название -> мажорная версия. */
export function jobSkillVersions(job: ExtractedJob): Map<string, string> {
  const map = new Map<string, string>();
  const text = [job.title, ...job.requirements, ...job.responsibilities, job.description].join(
    '\n',
  );
  for (const detected of detectTechnologiesDetailed(text)) {
    if (!detected.version) continue;
    const key = normalizeToken(detected.name);
    if (!map.has(key)) map.set(key, detected.version);
  }
  return map;
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
    versionMismatches: findVersionMismatches(job, profile, matched),
    missingMandatory,
    required,
    coverage: required.length === 0 ? 0 : matched.length / required.length,
    mandatoryCoverage: mandatory.length === 0 ? 1 : matchedMandatory.length / mandatory.length,
  };
}

/**
 * Находит навыки, которые у пользователя есть, но другой мажорной версии.
 * Навык без указанной версии в профиле считается подходящим под любую версию:
 * пользователь просто не стал уточнять.
 */
export function findVersionMismatches(
  job: ExtractedJob,
  profile: UserProfile,
  matched: string[],
): VersionMismatch[] {
  const required = jobSkillVersions(job);
  const have = profileSkillVersions(profile);
  const out: VersionMismatch[] = [];

  for (const skill of matched) {
    const key = normalizeToken(skill);
    const wanted = required.get(key);
    if (!wanted) continue;
    const versions = have.get(key);
    if (!versions || versions.size === 0) continue;
    // Пустая версия в профиле = «любая», это не расхождение.
    if (versions.has('') || versions.has(wanted)) continue;
    out.push({ skill, required: wanted, have: [...versions].filter(Boolean).sort() });
  }
  return out;
}
