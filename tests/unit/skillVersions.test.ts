import { describe, expect, it } from 'vitest';
import {
  detectTechnologiesDetailed,
  majorVersion,
  splitNameAndVersion,
} from '@/core/extraction/techDictionary';
import {
  findVersionMismatches,
  jobSkillVersions,
  matchSkills,
  profileSkillVersions,
} from '@/core/scoring/skillMatcher';
import { scoreJob, VERSION_MISMATCH_PENALTY } from '@/core/scoring/engine';
import { makeSkill, skillSchema } from '@/types/profile';
import { makeProfile } from '../fixtures/profile';
import { makeJob } from '../fixtures/jobs';

describe('разбор версии в названии навыка', () => {
  it.each([
    ['Vue 3', 'Vue', '3'],
    ['Vue3', 'Vue', '3'],
    ['React 18', 'React', '18'],
    ['Angular 15+', 'Angular', '15'],
    ['PHP 8.1', 'PHP', '8.1'],
    ['Node.js', 'Node.js', ''],
    ['TypeScript', 'TypeScript', ''],
  ])('«%s» -> имя «%s», версия «%s»', (input, name, version) => {
    const parsed = splitNameAndVersion(input);
    expect(parsed.name).toBe(name);
    expect(parsed.version).toBe(version);
  });

  it('не принимает за версию название, в котором цифра — часть имени', () => {
    // ES6 есть в словаре как синоним JavaScript, это не «ES версии 6».
    expect(splitNameAndVersion('ES6').version).toBe('');
  });

  it('оставляет только мажорную часть', () => {
    expect(majorVersion('8.1')).toBe('8');
    expect(majorVersion('3')).toBe('3');
    expect(majorVersion('')).toBe('');
  });
});

describe('версии в тексте вакансии', () => {
  it('находит версию рядом с названием', () => {
    const found = detectTechnologiesDetailed('Требуется опыт с Vue 3 и React 18, а также Docker');
    expect(found).toEqual(
      expect.arrayContaining([
        { name: 'Vue', version: '3' },
        { name: 'React', version: '18' },
        { name: 'Docker', version: '' },
      ]),
    );
  });

  it('собирает требуемые версии по всей вакансии', () => {
    const versions = jobSkillVersions(
      makeJob({ title: 'Vue 3 Developer', requirements: ['Опыт с Vue 3'], technologies: ['Vue'] }),
    );
    expect(versions.get('vue')).toBe('3');
  });
});

describe('версии в профиле', () => {
  it('схема хранит версию и уровень со значениями по умолчанию', () => {
    const skill = skillSchema.parse({ name: 'Vue', category: 'frontend' });
    expect(skill.version).toBe('');
    expect(skill.level).toBe('intermediate');
  });

  it('собирает версии по названию навыка', () => {
    const profile = makeProfile({
      skills: [
        makeSkill({ name: 'Vue', category: 'frontend', version: '2' }),
        makeSkill({ name: 'React', category: 'frontend' }),
      ],
    });
    const versions = profileSkillVersions(profile);
    expect(versions.get('vue')).toEqual(new Set(['2']));
    expect(versions.get('react')).toEqual(new Set(['']));
  });
});

describe('расхождение версий', () => {
  const jobVue3 = makeJob({
    title: 'Senior Vue 3 Developer',
    requirements: ['Опыт с Vue 3 обязателен'],
    responsibilities: [],
    technologies: ['Vue'],
    description: 'Нужен разработчик с Vue 3.',
  });

  it('находит Vue 2 против Vue 3', () => {
    const profile = makeProfile({
      skills: [makeSkill({ name: 'Vue', category: 'frontend', version: '2' })],
    });
    const mismatches = findVersionMismatches(jobVue3, profile, ['Vue']);
    expect(mismatches).toEqual([{ skill: 'Vue', required: '3', have: ['2'] }]);
  });

  it('не считает расхождением навык без указанной версии', () => {
    const profile = makeProfile({
      skills: [makeSkill({ name: 'Vue', category: 'frontend' })],
    });
    expect(findVersionMismatches(jobVue3, profile, ['Vue'])).toEqual([]);
  });

  it('не считает расхождением совпавшую версию', () => {
    const profile = makeProfile({
      skills: [makeSkill({ name: 'Vue', category: 'frontend', version: '3' })],
    });
    expect(findVersionMismatches(jobVue3, profile, ['Vue'])).toEqual([]);
  });

  it('засчитывает навык, но с пометкой, а не как отсутствующий', () => {
    const profile = makeProfile({
      skills: [makeSkill({ name: 'Vue', category: 'frontend', version: '2' })],
    });
    const match = matchSkills(jobVue3, profile);
    expect(match.matched).toContain('Vue');
    expect(match.missing).not.toContain('Vue');
    expect(match.versionMismatches).toHaveLength(1);
  });
});

describe('влияние версии на балл', () => {
  const job = makeJob({
    title: 'Vue 3 Developer',
    requirements: ['Обязательно Vue 3', 'TypeScript'],
    responsibilities: ['Разработка интерфейсов'],
    technologies: ['Vue', 'TypeScript'],
    description: 'Команда работает на Vue 3 и TypeScript.',
  });

  // Опыт работы обнуляем: иначе Vue из технологий прошлого места работы
  // добавился бы как навык без версии и перекрыл бы сравнение.
  const withVersion = (version: string) =>
    makeProfile({
      experience: [],
      skills: [
        makeSkill({ name: 'Vue', category: 'frontend', version }),
        makeSkill({ name: 'TypeScript', category: 'frontend' }),
      ],
    });

  it('нужная версия даёт балл выше, чем устаревшая', () => {
    const right = scoreJob({ job, profile: withVersion('3') });
    const old = scoreJob({ job, profile: withVersion('2') });
    expect(old.score).toBeLessThan(right.score);
    expect(old.versionMismatches).toHaveLength(1);
    expect(right.versionMismatches).toHaveLength(0);
  });

  it('устаревшая версия всё равно лучше, чем отсутствие навыка', () => {
    const old = scoreJob({ job, profile: withVersion('2') });
    const none = scoreJob({
      job,
      profile: makeProfile({
        experience: [],
        skills: [makeSkill({ name: 'TypeScript', category: 'frontend' })],
      }),
    });
    expect(old.score).toBeGreaterThan(none.score);
  });

  it('штраф за версию меньше, чем за отсутствующий навык', () => {
    expect(VERSION_MISMATCH_PENALTY).toBeGreaterThan(0);
    expect(VERSION_MISMATCH_PENALTY).toBeLessThan(1);
  });

  it('объясняет расхождение в разборе балла', () => {
    const result = scoreJob({ job, profile: withVersion('2') });
    expect(result.breakdown.technicalSkills.detail).toMatch(/вакансия просит 3/);
  });
});
