import { useState } from 'react';
import {
  EMPLOYMENT_TYPES,
  LANGUAGE_LEVELS,
  SENIORITY_LEVELS,
  SKILL_CATEGORIES,
  WORK_MODES,
  type LanguageLevel,
  type Skill,
  type SkillCategory,
  type UserProfile,
} from '@/types/profile';
import { canonicalizeTech, categoryOf } from '@/core/extraction/techDictionary';
import { createId } from '@/utils/id';

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

/** Shared profile editor used by both the Profile page and onboarding. */
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
  const [skillCategory, setSkillCategory] = useState<SkillCategory>('frontend');
  const [languageDraft, setLanguageDraft] = useState('');
  const [languageLevel, setLanguageLevel] = useState<LanguageLevel>('b2');

  const addSkill = () => {
    const name = canonicalizeTech(skillDraft.trim());
    if (!name) return;
    if (profile.skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
      setSkillDraft('');
      return;
    }
    const skill: Skill = { name, category: skillCategory, primary: false };
    onChange({ skills: [...profile.skills, skill] });
    setSkillDraft('');
  };

  const toggleArray = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  return (
    <div className="flex flex-col gap-4">
      {visible.includes('personal') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Personal</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="First name">
              <input
                className="jp-input"
                value={profile.personal.firstName}
                onChange={(event) =>
                  onChange({ personal: { ...profile.personal, firstName: event.target.value } })
                }
              />
            </Field>
            <Field label="Last name">
              <input
                className="jp-input"
                value={profile.personal.lastName}
                onChange={(event) =>
                  onChange({ personal: { ...profile.personal, lastName: event.target.value } })
                }
              />
            </Field>
          </div>
          <Field label="Email" hint="Stored locally. Never included in AI prompts.">
            <input
              className="jp-input"
              type="email"
              value={profile.personal.email}
              onChange={(event) =>
                onChange({ personal: { ...profile.personal, email: event.target.value } })
              }
            />
          </Field>
          <Field label="Phone">
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
            <Field label="Country">
              <input
                className="jp-input"
                value={profile.location.country}
                onChange={(event) =>
                  onChange({ location: { ...profile.location, country: event.target.value } })
                }
              />
            </Field>
            <Field label="City">
              <input
                className="jp-input"
                value={profile.location.city}
                onChange={(event) =>
                  onChange({ location: { ...profile.location, city: event.target.value } })
                }
              />
            </Field>
          </div>
          <Field label="LinkedIn URL">
            <input
              className="jp-input"
              value={profile.links.linkedin}
              onChange={(event) =>
                onChange({ links: { ...profile.links, linkedin: event.target.value } })
              }
            />
          </Field>
          <Field label="GitHub URL">
            <input
              className="jp-input"
              value={profile.links.github}
              onChange={(event) =>
                onChange({ links: { ...profile.links, github: event.target.value } })
              }
            />
          </Field>
          <Field label="Portfolio URL">
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
          <h3 className="jp-section-title">Professional</h3>
          <Field label="Current position">
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
          <Field label="Desired position">
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
            <Field label="Seniority">
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
                    {level}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Years of experience">
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
          <Field label="Summary" hint="Used to ground cover letters in real facts.">
            <textarea
              className="jp-input min-h-[70px]"
              value={profile.professional.summary}
              onChange={(event) =>
                onChange({ professional: { ...profile.professional, summary: event.target.value } })
              }
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Currency">
              <input
                className="jp-input"
                value={profile.salary.currency}
                onChange={(event) =>
                  onChange({ salary: { ...profile.salary, currency: event.target.value } })
                }
              />
            </Field>
            <Field label="Current salary">
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
            <Field label="Desired salary">
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
          <Field label="Salary period">
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
                  per {period}
                </option>
              ))}
            </select>
          </Field>
        </section>
      ) : null}

      {visible.includes('skills') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Technical stack</h3>
          <div className="flex gap-1.5">
            <input
              className="jp-input"
              placeholder="Add any technology…"
              value={skillDraft}
              onChange={(event) => {
                setSkillDraft(event.target.value);
                const guessed = categoryOf(event.target.value);
                if (guessed !== 'other') setSkillCategory(guessed);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addSkill();
                }
              }}
              aria-label="Technology name"
            />
            <select
              className="jp-input w-28"
              value={skillCategory}
              onChange={(event) => setSkillCategory(event.target.value as SkillCategory)}
              aria-label="Skill category"
            >
              {SKILL_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button type="button" className="jp-button-primary" onClick={addSkill}>
              Add
            </button>
          </div>
          {SKILL_CATEGORIES.map((category) => {
            const items = profile.skills.filter((skill) => skill.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <p className="text-[11px] font-semibold capitalize text-muted">{category}</p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {items.map((skill) => (
                    <li key={skill.name} className="jp-badge gap-1.5">
                      <button
                        type="button"
                        title={skill.primary ? 'Core skill' : 'Mark as core skill'}
                        aria-pressed={skill.primary}
                        onClick={() =>
                          onChange({
                            skills: profile.skills.map((entry) =>
                              entry.name === skill.name
                                ? { ...entry, primary: !entry.primary }
                                : entry,
                            ),
                          })
                        }
                        className={skill.primary ? 'text-brand' : 'text-muted'}
                      >
                        ★
                      </button>
                      {skill.name}
                      <button
                        type="button"
                        aria-label={`Remove ${skill.name}`}
                        onClick={() =>
                          onChange({
                            skills: profile.skills.filter((entry) => entry.name !== skill.name),
                          })
                        }
                        className="text-muted hover:text-poor"
                      >
                        ✕
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
          <h3 className="jp-section-title">Languages</h3>
          <div className="flex gap-1.5">
            <input
              className="jp-input"
              placeholder="English"
              value={languageDraft}
              onChange={(event) => setLanguageDraft(event.target.value)}
              aria-label="Language name"
            />
            <select
              className="jp-input w-24"
              value={languageLevel}
              onChange={(event) => setLanguageLevel(event.target.value as LanguageLevel)}
              aria-label="Language level"
            >
              {LANGUAGE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.toUpperCase()}
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
              Add
            </button>
          </div>
          <ul className="flex flex-wrap gap-1">
            {profile.languages.map((language) => (
              <li key={language.name} className="jp-badge gap-1.5">
                {language.name} · {language.level.toUpperCase()}
                <button
                  type="button"
                  aria-label={`Remove ${language.name}`}
                  onClick={() =>
                    onChange({
                      languages: profile.languages.filter((entry) => entry.name !== language.name),
                    })
                  }
                  className="text-muted hover:text-poor"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visible.includes('preferences') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Preferences</h3>
          <fieldset>
            <legend className="jp-label">Employment type</legend>
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
                  {type.replace('_', ' ')}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="jp-label">Work mode</legend>
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
                  {mode}
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
            Willing to relocate
          </label>
          <Field label="Relocation countries" hint="Comma separated. Leave empty for anywhere.">
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
          <Field label="Dealbreakers" hint="Comma separated, e.g. on-call, crypto.">
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
            I need visa sponsorship
          </label>
        </section>
      ) : null}

      {visible.includes('experience') ? (
        <section className="flex flex-col gap-2">
          <h3 className="jp-section-title">Experience</h3>
          {profile.experience.map((entry) => (
            <div key={entry.id} className="jp-card flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="jp-input"
                  placeholder="Company"
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
                  placeholder="Position"
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
                  placeholder="Start (2021-03)"
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
                  placeholder="End (or empty)"
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
                placeholder="What you did there"
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
                placeholder="Technologies (comma separated)"
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
                Remove
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
            + Add experience
          </button>
        </section>
      ) : null}
    </div>
  );
}
