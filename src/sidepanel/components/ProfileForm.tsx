import { useMemo, useState } from 'react';
import {
  EMPLOYMENT_TYPES,
  LANGUAGE_LEVELS,
  SENIORITY_LEVELS,
  SKILL_CATEGORIES,
  SKILL_LEVELS,
  WORK_MODES,
  makeSkill,
  type LanguageLevel,
  type Skill,
  type SkillCategory,
  type SkillLevel,
  type UserProfile,
} from '@/types/profile';
import {
  canonicalizeTech,
  categoryOf,
  searchTech,
  splitNameAndVersion,
} from '@/core/extraction/techDictionary';
import { normalizeToken } from '@/utils/text';
import { createId } from '@/utils/id';
import {
  EMPLOYMENT_TYPE_LABEL,
  LANGUAGE_LEVEL_LABEL,
  SPOKEN_LANGUAGES,
  SALARY_PERIOD_LABEL,
  SENIORITY_LABEL,
  SKILL_CATEGORY_LABEL,
  SKILL_LEVEL_LABEL,
  WORK_MODE_LABEL,
} from '../labels';
import { Icon } from './Icon';
import { Combobox, type ComboboxOption } from './Combobox';

interface Props {
  profile: UserProfile;
  onChange(patch: Partial<UserProfile>): void;
  sections?: (
    'personal' | 'professional' | 'skills' | 'languages' | 'preferences' | 'experience'
  )[];
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="jp-label">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-[10px] text-muted">{hint}</span> : null}
    </label>
  );
}

/** Общий редактор профиля — используется и на странице профиля, и в онбординге. */
export function ProfileForm({ profile, onChange, sections }: Props) {
  const visible = sections ?? [
    'personal',
    'professional',
    'skills',
    'languages',
    'preferences',
    'experience',
  ];
  const [skillDraft, setSkillDraft] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');
  const [skillCategory, setSkillCategory] = useState<SkillCategory>('frontend');
  /** Какие категории показывать в списке. К выбору категории нового навыка отношения не имеет. */
  const [skillFilter, setSkillFilter] = useState<'all' | SkillCategory>('all');
  const [languageDraft, setLanguageDraft] = useState('');
  const [languageLevel, setLanguageLevel] = useState<LanguageLevel>('b2');

  /**
   * Подсказки под тем, что уже набрано. Версию из строки убираем: по «Vue 3»
   * искать нужно «Vue», иначе цифра ломает совпадение.
   */
  const skillOptions: ComboboxOption[] = useMemo(() => {
    const query = splitNameAndVersion(skillDraft.trim()).name || skillDraft.trim();
    return searchTech(query, 8).map(({ entry, matchedAs }) => ({
      value: entry.canonical,
      hint: SKILL_CATEGORY_LABEL[entry.category],
      // Показываем, по какому написанию нашлось: «js → JavaScript» объясняет,
      // почему в списке оказалось не то, что набрано.
      note:
        normalizeToken(matchedAs) === normalizeToken(entry.canonical)
          ? undefined
          : `по «${matchedAs}»`,
    }));
  }, [skillDraft]);

  /** Категории, в которых что-то есть: фильтровать по пустым незачем. */
  const usedCategories = SKILL_CATEGORIES.filter((category) =>
    profile.skills.some((skill) => skill.category === category),
  );
  // Выбранная категория могла опустеть — тогда её кнопка исчезает, и остаться
  // на ней значило бы смотреть в пустой список без возможности выйти.
  const activeFilter =
    skillFilter !== 'all' && usedCategories.includes(skillFilter) ? skillFilter : 'all';

  const addSkill = (picked?: string) => {
    // «Vue 3» в поле имени разбирается на название и версию.
    const typed = splitNameAndVersion(skillDraft.trim());
    const parsed = splitNameAndVersion((picked ?? skillDraft).trim());
    const name = canonicalizeTech(parsed.name);
    if (!name) return;
    // Из подсказки приходит одно название («Vue»), а версию человек набрал
    // рядом с ним («Vue 3») — иначе цифра потерялась бы при выборе из списка.
    const version = parsed.version || (picked ? typed.version : '');
    const duplicate = profile.skills.some(
      (skill) =>
        skill.name.toLowerCase() === name.toLowerCase() && (skill.version ?? '') === version,
    );
    if (duplicate) {
      setSkillDraft('');
      return;
    }
    // Категория — свойство самой технологии, а не предпочтение: класть Next.js
    // в «прочее» нельзя. Раз словарь решает, select обязан показать то же
    // самое, иначе он противоречит тому, куда навык на самом деле попал.
    const known = categoryOf(name);
    const category = known === 'other' ? skillCategory : known;
    setSkillCategory(category);
    const skill: Skill = makeSkill({ name, category, version, level: skillLevel });
    onChange({ skills: [...profile.skills, skill] });
    setSkillDraft('');
  };

  /** Подсказки языков: ищем и по русскому названию, и по самоназванию. */
  const languageOptions: ComboboxOption[] = useMemo(() => {
    const needle = languageDraft.trim().toLowerCase();
    return SPOKEN_LANGUAGES.filter(
      (language) =>
        !needle ||
        language.name.toLowerCase().includes(needle) ||
        language.native.toLowerCase().includes(needle) ||
        language.code === needle,
    )
      .slice(0, 8)
      .map((language) => ({
        value: language.name,
        note: language.native === language.name ? undefined : language.native,
        hint: language.code.toUpperCase(),
      }));
  }, [languageDraft]);

  const addLanguage = (picked?: string) => {
    const name = (picked ?? languageDraft).trim();
    if (!name) return;
    // Код языка берём из списка; выведенный из первых двух букв он был бы
    // просто мусором для незнакомого названия.
    const known = SPOKEN_LANGUAGES.find(
      (language) => language.name.toLowerCase() === name.toLowerCase(),
    );
    onChange({
      languages: [
        ...profile.languages.filter(
          (language) => language.name.toLowerCase() !== name.toLowerCase(),
        ),
        { code: known?.code ?? name.slice(0, 2).toLowerCase(), name, level: languageLevel },
      ],
    });
    setLanguageDraft('');
  };

  /**
   * Правка по месту в списке. По имени с версией искать нельзя: версия и есть
   * то, что правят, — ключ менялся бы на каждой набранной цифре, React
   * пересоздавал бы поле, и фокус слетал бы после первого же символа.
   */
  const patchSkillAt = (index: number, patch: Partial<Skill>) =>
    onChange({
      skills: profile.skills.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    });

  const removeSkillAt = (index: number) =>
    onChange({ skills: profile.skills.filter((_, i) => i !== index) });

  const toggleArray = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  return (
    <div className="flex flex-col gap-4">
      {visible.includes('personal') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Личные данные</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Имя">
              <input
                className="jp-input"
                value={profile.personal.firstName}
                onChange={(event) =>
                  onChange({ personal: { ...profile.personal, firstName: event.target.value } })
                }
              />
            </Field>
            <Field label="Фамилия">
              <input
                className="jp-input"
                value={profile.personal.lastName}
                onChange={(event) =>
                  onChange({ personal: { ...profile.personal, lastName: event.target.value } })
                }
              />
            </Field>
          </div>
          <Field label="Email" hint="Хранится локально. Никогда не попадает в промпты AI.">
            <input
              className="jp-input"
              type="email"
              value={profile.personal.email}
              onChange={(event) =>
                onChange({ personal: { ...profile.personal, email: event.target.value } })
              }
            />
          </Field>
          <Field label="Телефон">
            <input
              className="jp-input"
              type="tel"
              value={profile.personal.phone}
              onChange={(event) =>
                onChange({ personal: { ...profile.personal, phone: event.target.value } })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Страна">
              <input
                className="jp-input"
                value={profile.location.country}
                onChange={(event) =>
                  onChange({ location: { ...profile.location, country: event.target.value } })
                }
              />
            </Field>
            <Field label="Город">
              <input
                className="jp-input"
                value={profile.location.city}
                onChange={(event) =>
                  onChange({ location: { ...profile.location, city: event.target.value } })
                }
              />
            </Field>
          </div>
          <Field label="Ссылка на LinkedIn">
            <input
              className="jp-input"
              value={profile.links.linkedin}
              onChange={(event) =>
                onChange({ links: { ...profile.links, linkedin: event.target.value } })
              }
            />
          </Field>
          <Field label="Ссылка на GitHub">
            <input
              className="jp-input"
              value={profile.links.github}
              onChange={(event) =>
                onChange({ links: { ...profile.links, github: event.target.value } })
              }
            />
          </Field>
          <Field label="Ссылка на портфолио">
            <input
              className="jp-input"
              value={profile.links.portfolio}
              onChange={(event) =>
                onChange({ links: { ...profile.links, portfolio: event.target.value } })
              }
            />
          </Field>
        </section>
      ) : null}

      {visible.includes('professional') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Профессиональный профиль</h3>
          <Field label="Текущая должность">
            <input
              className="jp-input"
              value={profile.professional.currentPosition}
              onChange={(event) =>
                onChange({
                  professional: { ...profile.professional, currentPosition: event.target.value },
                })
              }
            />
          </Field>
          <Field label="Желаемая должность">
            <input
              className="jp-input"
              value={profile.professional.desiredPosition}
              onChange={(event) =>
                onChange({
                  professional: { ...profile.professional, desiredPosition: event.target.value },
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Уровень">
              <select
                className="jp-input"
                value={profile.professional.seniority}
                onChange={(event) =>
                  onChange({
                    professional: {
                      ...profile.professional,
                      seniority: event.target.value as UserProfile['professional']['seniority'],
                    },
                  })
                }
              >
                {SENIORITY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {SENIORITY_LABEL[level]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Лет опыта">
              <input
                className="jp-input"
                type="number"
                min={0}
                max={60}
                value={profile.professional.experienceYears}
                onChange={(event) =>
                  onChange({
                    professional: {
                      ...profile.professional,
                      experienceYears: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
          </div>
          <Field
            label="О себе"
            hint="На этом AI строит сопроводительные письма, не выдумывая фактов."
          >
            <textarea
              className="jp-input min-h-[70px]"
              value={profile.professional.summary}
              onChange={(event) =>
                onChange({ professional: { ...profile.professional, summary: event.target.value } })
              }
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Валюта">
              <input
                className="jp-input"
                value={profile.salary.currency}
                onChange={(event) =>
                  onChange({ salary: { ...profile.salary, currency: event.target.value } })
                }
              />
            </Field>
            <Field label="Текущая зарплата">
              <input
                className="jp-input"
                type="number"
                min={0}
                value={profile.salary.current ?? ''}
                onChange={(event) =>
                  onChange({
                    salary: {
                      ...profile.salary,
                      current: event.target.value ? Number(event.target.value) : undefined,
                    },
                  })
                }
              />
            </Field>
            <Field label="Желаемая зарплата">
              <input
                className="jp-input"
                type="number"
                min={0}
                value={profile.salary.expected ?? ''}
                onChange={(event) =>
                  onChange({
                    salary: {
                      ...profile.salary,
                      expected: event.target.value ? Number(event.target.value) : undefined,
                    },
                  })
                }
              />
            </Field>
          </div>
          <Field label="Период зарплаты">
            <select
              className="jp-input"
              value={profile.salary.period}
              onChange={(event) =>
                onChange({
                  salary: {
                    ...profile.salary,
                    period: event.target.value as UserProfile['salary']['period'],
                  },
                })
              }
            >
              {(['hour', 'day', 'month', 'year'] as const).map((period) => (
                <option key={period} value={period}>
                  {SALARY_PERIOD_LABEL[period]}
                </option>
              ))}
            </select>
          </Field>
        </section>
      ) : null}

      {visible.includes('skills') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Технический стек</h3>
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5">
              <Combobox
                className="flex-1"
                value={skillDraft}
                onChange={(next) => {
                  setSkillDraft(next);
                  const guessed = categoryOf(splitNameAndVersion(next).name);
                  if (guessed !== 'other') setSkillCategory(guessed);
                }}
                onCommit={(picked) => addSkill(picked)}
                options={skillOptions}
                caption="Выберите из списка — тогда навык точно совпадёт с вакансией"
                placeholder="React, Vue 3, Postgres…"
                ariaLabel="Название технологии"
              />
              <button
                type="button"
                className="jp-button-primary flex-shrink-0"
                onClick={() => addSkill()}
              >
                Добавить
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                className="jp-input"
                value={skillCategory}
                onChange={(event) => setSkillCategory(event.target.value as SkillCategory)}
                aria-label="Категория навыка"
              >
                {SKILL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {SKILL_CATEGORY_LABEL[category]}
                  </option>
                ))}
              </select>
              <select
                className="jp-input"
                value={skillLevel}
                onChange={(event) => setSkillLevel(event.target.value as SkillLevel)}
                aria-label="Уровень владения"
              >
                {SKILL_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {SKILL_LEVEL_LABEL[level]}
                  </option>
                ))}
              </select>
            </div>
            <p className="jp-hint">
              Список ищет по сокращениям и прощает опечатки, категорию подставляет сам. Версию
              пишите прямо в названии — «Vue 3», «React 18» — и только если от неё зависит сама
              работа.
            </p>
          </div>
          {usedCategories.length > 1 ? (
            <div className="-mx-3.5 overflow-x-auto px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="jp-segmented w-max">
                <button
                  type="button"
                  aria-pressed={activeFilter === 'all'}
                  onClick={() => setSkillFilter('all')}
                >
                  все
                </button>
                {usedCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={activeFilter === category}
                    onClick={() => setSkillFilter(category)}
                    className="whitespace-nowrap"
                  >
                    {SKILL_CATEGORY_LABEL[category]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {SKILL_CATEGORIES.filter(
            (category) => activeFilter === 'all' || activeFilter === category,
          ).map((category) => {
            // Индекс в исходном списке — единственная стабильная примета навыка:
            // своего идентификатора у него нет, а имя с версией меняются прямо
            // во время правки.
            const items = profile.skills
              .map((skill, index) => ({ skill, index }))
              .filter((entry) => entry.skill.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <p className="mb-1 text-[11px] font-semibold text-muted">
                  {SKILL_CATEGORY_LABEL[category]}
                </p>
                {/*
                  Строками, а не чипами: у навыка четыре управляющих элемента, и
                  втиснутые в «тег» они не помещались в узкую панель, а версия
                  показывалась дважды — в подписи и в своём поле.
                */}
                <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-control border border-border">
                  {items.map(({ skill, index }) => (
                    <li key={index} className="flex items-center gap-2 px-2.5 py-1.5">
                      <button
                        type="button"
                        title={
                          skill.primary ? 'Ключевой навык — снять отметку' : 'Отметить как ключевой'
                        }
                        aria-pressed={skill.primary}
                        aria-label={`Ключевой навык: ${skill.name}`}
                        onClick={() => patchSkillAt(index, { primary: !skill.primary })}
                        className={`flex-shrink-0 text-[13px] leading-none transition-colors ${
                          skill.primary ? 'text-brand' : 'text-muted hover:text-content'
                        }`}
                      >
                        ★
                      </button>
                      {/*
                        Версия стоит в подписи и только там: отдельное поле
                        рядом с названием повторяло её вторым разом. Меняется
                        она пересозданием навыка — «Vue 3» пишется в строке
                        добавления, и меняют версию куда реже, чем читают список.
                      */}
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] ${
                          skill.primary ? 'font-medium' : ''
                        }`}
                        title={skill.version ? `${skill.name} ${skill.version}` : skill.name}
                      >
                        {skill.name}
                        {skill.version ? ` ${skill.version}` : ''}
                      </span>
                      <select
                        className="jp-input w-auto flex-shrink-0 py-0.5 pl-2 text-[11px]"
                        value={skill.level}
                        onChange={(event) =>
                          patchSkillAt(index, { level: event.target.value as SkillLevel })
                        }
                        aria-label={`Уровень владения ${skill.name}`}
                      >
                        {SKILL_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {SKILL_LEVEL_LABEL[level]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Убрать ${skill.name}`}
                        onClick={() => removeSkillAt(index)}
                        className="flex-shrink-0 rounded-full text-muted transition hover:text-poor"
                      >
                        <Icon name="x" size={12} strokeWidth={2.4} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {profile.skills.length > 0 ? (
            <p className="jp-hint">
              ★ — ключевой навык: AI упоминает его в первую очередь. На балл совпадения это не
              влияет, балл считается по требованиям вакансии.
            </p>
          ) : null}
        </section>
      ) : null}

      {visible.includes('languages') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Языки</h3>
          <div className="flex gap-1.5">
            <Combobox
              className="flex-1"
              value={languageDraft}
              onChange={setLanguageDraft}
              onCommit={(picked) => addLanguage(picked)}
              options={languageOptions}
              caption="Язык из списка"
              placeholder="Английский, Deutsch, es…"
              ariaLabel="Название языка"
            />
            <select
              className="jp-input w-[86px] flex-shrink-0"
              value={languageLevel}
              onChange={(event) => setLanguageLevel(event.target.value as LanguageLevel)}
              aria-label="Уровень языка"
            >
              {LANGUAGE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LANGUAGE_LEVEL_LABEL[level]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="jp-button-primary flex-shrink-0"
              onClick={() => addLanguage()}
            >
              Добавить
            </button>
          </div>
          <ul className="flex flex-wrap gap-1">
            {profile.languages.map((language) => (
              <li key={language.name} className="jp-badge gap-1.5">
                {language.name} · {LANGUAGE_LEVEL_LABEL[language.level]}
                <button
                  type="button"
                  aria-label={`Убрать ${language.name}`}
                  onClick={() =>
                    onChange({
                      languages: profile.languages.filter((entry) => entry.name !== language.name),
                    })
                  }
                  className="rounded-full text-muted transition hover:text-poor"
                >
                  <Icon name="x" size={11} strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visible.includes('preferences') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Предпочтения</h3>
          <fieldset>
            <legend className="jp-label">Тип занятости</legend>
            <div className="flex flex-wrap gap-1">
              {EMPLOYMENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={profile.preferences.employmentTypes.includes(type)}
                  onClick={() =>
                    onChange({
                      preferences: {
                        ...profile.preferences,
                        employmentTypes: toggleArray(profile.preferences.employmentTypes, type),
                      },
                    })
                  }
                  className={`jp-badge cursor-pointer transition duration-200 ease-apple ${
                    profile.preferences.employmentTypes.includes(type)
                      ? 'bg-brand text-brand-fg'
                      : 'hover:bg-border'
                  }`}
                >
                  {EMPLOYMENT_TYPE_LABEL[type]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="jp-label">Формат работы</legend>
            <div className="flex flex-wrap gap-1">
              {WORK_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={profile.preferences.workModes.includes(mode)}
                  onClick={() =>
                    onChange({
                      preferences: {
                        ...profile.preferences,
                        workModes: toggleArray(profile.preferences.workModes, mode),
                      },
                    })
                  }
                  className={`jp-badge cursor-pointer transition duration-200 ease-apple ${
                    profile.preferences.workModes.includes(mode)
                      ? 'bg-brand text-brand-fg'
                      : 'hover:bg-border'
                  }`}
                >
                  {WORK_MODE_LABEL[mode]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={profile.location.willingToRelocate}
              onChange={(event) =>
                onChange({
                  location: { ...profile.location, willingToRelocate: event.target.checked },
                })
              }
            />
            Готов(а) к переезду
          </label>
          <Field label="Страны для переезда" hint="Через запятую. Пусто — куда угодно.">
            <input
              className="jp-input"
              value={profile.location.relocationCountries.join(', ')}
              onChange={(event) =>
                onChange({
                  location: {
                    ...profile.location,
                    relocationCountries: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </Field>
          <Field label="Стоп-факторы" hint="Через запятую, например: дежурства, крипта.">
            <input
              className="jp-input"
              value={profile.preferences.dealbreakers.join(', ')}
              onChange={(event) =>
                onChange({
                  preferences: {
                    ...profile.preferences,
                    dealbreakers: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={profile.preferences.requiresVisaSponsorship}
              onChange={(event) =>
                onChange({
                  preferences: {
                    ...profile.preferences,
                    requiresVisaSponsorship: event.target.checked,
                  },
                })
              }
            />
            Мне нужно спонсорство визы
          </label>
        </section>
      ) : null}

      {visible.includes('experience') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Опыт работы</h3>
          {profile.experience.map((entry) => (
            <div key={entry.id} className="jp-card flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="jp-input"
                  placeholder="Компания"
                  value={entry.company}
                  onChange={(event) =>
                    onChange({
                      experience: profile.experience.map((item) =>
                        item.id === entry.id ? { ...item, company: event.target.value } : item,
                      ),
                    })
                  }
                />
                <input
                  className="jp-input"
                  placeholder="Должность"
                  value={entry.position}
                  onChange={(event) =>
                    onChange({
                      experience: profile.experience.map((item) =>
                        item.id === entry.id ? { ...item, position: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="jp-input"
                  placeholder="Начало (2021-03)"
                  value={entry.startDate}
                  onChange={(event) =>
                    onChange({
                      experience: profile.experience.map((item) =>
                        item.id === entry.id ? { ...item, startDate: event.target.value } : item,
                      ),
                    })
                  }
                />
                <input
                  className="jp-input"
                  placeholder="Окончание (или пусто)"
                  value={entry.endDate}
                  onChange={(event) =>
                    onChange({
                      experience: profile.experience.map((item) =>
                        item.id === entry.id
                          ? { ...item, endDate: event.target.value, current: !event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </div>
              <textarea
                className="jp-input min-h-[54px]"
                placeholder="Чем вы там занимались"
                value={entry.description}
                onChange={(event) =>
                  onChange({
                    experience: profile.experience.map((item) =>
                      item.id === entry.id ? { ...item, description: event.target.value } : item,
                    ),
                  })
                }
              />
              <input
                className="jp-input"
                placeholder="Технологии (через запятую)"
                value={entry.technologies.join(', ')}
                onChange={(event) =>
                  onChange({
                    experience: profile.experience.map((item) =>
                      item.id === entry.id
                        ? {
                            ...item,
                            technologies: event.target.value
                              .split(',')
                              .map((value) => value.trim())
                              .filter(Boolean),
                          }
                        : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="jp-button self-start"
                onClick={() =>
                  onChange({
                    experience: profile.experience.filter((item) => item.id !== entry.id),
                  })
                }
              >
                Убрать
              </button>
            </div>
          ))}
          <button
            type="button"
            className="jp-button self-start"
            onClick={() =>
              onChange({
                experience: [
                  ...profile.experience,
                  {
                    id: createId('exp'),
                    company: '',
                    position: '',
                    startDate: '',
                    endDate: '',
                    current: true,
                    description: '',
                    technologies: [],
                  },
                ],
              })
            }
          >
            + Добавить место работы
          </button>
        </section>
      ) : null}
    </div>
  );
}
