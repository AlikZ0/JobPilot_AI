import { useState } from 'react';
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
  splitNameAndVersion,
} from '@/core/extraction/techDictionary';
import { createId } from '@/utils/id';
import {
  EMPLOYMENT_TYPE_LABEL,
  LANGUAGE_LEVEL_LABEL,
  SALARY_PERIOD_LABEL,
  SENIORITY_LABEL,
  SKILL_CATEGORY_LABEL,
  SKILL_LEVEL_LABEL,
  WORK_MODE_LABEL,
} from '../labels';
import { Icon } from './Icon';

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
  const [skillVersion, setSkillVersion] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');
  const [skillCategory, setSkillCategory] = useState<SkillCategory>('frontend');
  const [languageDraft, setLanguageDraft] = useState('');
  const [languageLevel, setLanguageLevel] = useState<LanguageLevel>('b2');

  const addSkill = () => {
    // «Vue 3» в поле имени разбирается на название и версию.
    const parsed = splitNameAndVersion(skillDraft.trim());
    const name = canonicalizeTech(parsed.name);
    if (!name) return;
    const version = skillVersion.trim() || parsed.version;
    const duplicate = profile.skills.some(
      (skill) =>
        skill.name.toLowerCase() === name.toLowerCase() && (skill.version ?? '') === version,
    );
    if (duplicate) {
      setSkillDraft('');
      setSkillVersion('');
      return;
    }
    const skill: Skill = makeSkill({
      name,
      category: skillCategory,
      version,
      level: skillLevel,
    });
    onChange({ skills: [...profile.skills, skill] });
    setSkillDraft('');
    setSkillVersion('');
  };

  /** Ключ навыка: название плюс версия, чтобы Vue 2 и Vue 3 были разными. */
  const skillKey = (skill: Skill) => `${skill.name}@${skill.version || '*'}`;

  const patchSkill = (target: Skill, patch: Partial<Skill>) =>
    onChange({
      skills: profile.skills.map((entry) =>
        skillKey(entry) === skillKey(target) ? { ...entry, ...patch } : entry,
      ),
    });

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
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <input
                className="jp-input"
                placeholder="Например: Vue 3, React, Node.js"
                value={skillDraft}
                onChange={(event) => {
                  setSkillDraft(event.target.value);
                  const guessed = categoryOf(splitNameAndVersion(event.target.value).name);
                  if (guessed !== 'other') setSkillCategory(guessed);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addSkill();
                  }
                }}
                aria-label="Название технологии"
              />
              <input
                className="jp-input w-16"
                placeholder="верс."
                value={skillVersion}
                onChange={(event) => setSkillVersion(event.target.value)}
                aria-label="Версия"
                title="Мажорная версия, например 3 для Vue 3. Пусто — версия не важна."
              />
              <button type="button" className="jp-button-primary" onClick={addSkill}>
                Добавить
              </button>
            </div>
            <div className="flex gap-1.5">
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
            <p className="text-[10px] text-muted">
              Версия важна там, где отличается сама работа: Vue 2 и Vue 3, React 16 и 18. Если
              версия не указана, навык подойдёт под любое требование вакансии.
            </p>
          </div>
          {SKILL_CATEGORIES.map((category) => {
            const items = profile.skills.filter((skill) => skill.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <p className="text-[11px] font-semibold text-muted">
                  {SKILL_CATEGORY_LABEL[category]}
                </p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {items.map((skill) => (
                    <li key={skillKey(skill)} className="jp-badge gap-1.5">
                      <button
                        type="button"
                        title={skill.primary ? 'Ключевой навык' : 'Отметить как ключевой'}
                        aria-pressed={skill.primary}
                        onClick={() => patchSkill(skill, { primary: !skill.primary })}
                        className={skill.primary ? 'text-brand' : 'text-muted'}
                      >
                        ★
                      </button>
                      <span>
                        {skill.name}
                        {skill.version ? ` ${skill.version}` : ''}
                      </span>
                      <input
                        className="w-8 rounded border border-border bg-transparent px-1 text-[10px]"
                        value={skill.version}
                        placeholder="в."
                        onChange={(event) => patchSkill(skill, { version: event.target.value })}
                        aria-label={`Версия ${skill.name}`}
                      />
                      <select
                        className="rounded border border-border bg-transparent text-[10px]"
                        value={skill.level}
                        onChange={(event) =>
                          patchSkill(skill, { level: event.target.value as SkillLevel })
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
                        onClick={() =>
                          onChange({
                            skills: profile.skills.filter(
                              (entry) => skillKey(entry) !== skillKey(skill),
                            ),
                          })
                        }
                        className="rounded-full text-muted transition hover:text-poor"
                      >
                        <Icon name="x" size={11} strokeWidth={2.4} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}

      {visible.includes('languages') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Языки</h3>
          <div className="flex gap-1.5">
            <input
              className="jp-input"
              placeholder="Английский"
              value={languageDraft}
              onChange={(event) => setLanguageDraft(event.target.value)}
              aria-label="Название языка"
            />
            <select
              className="jp-input w-24"
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
              className="jp-button-primary"
              onClick={() => {
                const name = languageDraft.trim();
                if (!name) return;
                onChange({
                  languages: [
                    ...profile.languages.filter(
                      (language) => language.name.toLowerCase() !== name.toLowerCase(),
                    ),
                    { code: name.slice(0, 2).toLowerCase(), name, level: languageLevel },
                  ],
                });
                setLanguageDraft('');
              }}
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
                  className={`jp-badge ${
                    profile.preferences.employmentTypes.includes(type)
                      ? 'border-brand text-brand'
                      : ''
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
                  className={`jp-badge ${
                    profile.preferences.workModes.includes(mode) ? 'border-brand text-brand' : ''
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
