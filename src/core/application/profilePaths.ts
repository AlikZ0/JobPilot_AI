import type { UserProfile } from '@/types/profile';
import { canonicalizeTech } from '@/core/extraction/techDictionary';

/** Пути в профиле, которые разрешено читать маппингу полей. */
export const PROFILE_PATHS = [
  'personal.firstName',
  'personal.lastName',
  'personal.fullName',
  'personal.email',
  'personal.phone',
  'location.country',
  'location.city',
  'location.willingToRelocate',
  'links.linkedin',
  'links.github',
  'links.portfolio',
  'professional.currentPosition',
  'professional.desiredPosition',
  'professional.experienceYears',
  'professional.summary',
  'salary.current',
  'salary.expected',
  'preferences.noticePeriodWeeks',
  'preferences.availableFrom',
  'preferences.workAuthorization',
  'preferences.requiresVisaSponsorship',
  'skills.list',
  'languages.list',
] as const;

export type ProfilePath = (typeof PROFILE_PATHS)[number];

export function isProfilePath(value: string): value is ProfilePath {
  return (PROFILE_PATHS as readonly string[]).includes(value);
}

/**
 * Возвращает значение профиля как строку, которую нужно вписать в поле формы.
 * Неизвестный путь даёт пустую строку, а не исключение, поэтому неудачная
 * подсказка AI не может сломать автозаполнение.
 */
export function readProfilePath(profile: UserProfile, path: string): string {
  switch (path) {
    case 'personal.firstName':
      return profile.personal.firstName;
    case 'personal.lastName':
      return profile.personal.lastName;
    case 'personal.fullName':
      return [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ');
    case 'personal.email':
      return profile.personal.email;
    case 'personal.phone':
      return profile.personal.phone;
    case 'location.country':
      return profile.location.country;
    case 'location.city':
      return profile.location.city;
    case 'location.willingToRelocate':
      return profile.location.willingToRelocate ? 'Да' : 'Нет';
    case 'links.linkedin':
      return profile.links.linkedin;
    case 'links.github':
      return profile.links.github;
    case 'links.portfolio':
      return profile.links.portfolio;
    case 'professional.currentPosition':
      return profile.professional.currentPosition;
    case 'professional.desiredPosition':
      return profile.professional.desiredPosition;
    case 'professional.experienceYears':
      return String(profile.professional.experienceYears || '');
    case 'professional.summary':
      return profile.professional.summary;
    case 'salary.current':
      return profile.salary.current ? String(profile.salary.current) : '';
    case 'salary.expected':
      return profile.salary.expected ? String(profile.salary.expected) : '';
    case 'preferences.noticePeriodWeeks':
      return profile.preferences.noticePeriodWeeks !== undefined
        ? String(profile.preferences.noticePeriodWeeks)
        : '';
    case 'preferences.availableFrom':
      return profile.preferences.availableFrom ?? '';
    case 'preferences.workAuthorization':
      return profile.preferences.workAuthorization.join(', ');
    case 'preferences.requiresVisaSponsorship':
      return profile.preferences.requiresVisaSponsorship ? 'Да' : 'Нет';
    case 'skills.list':
      return profile.skills.map((skill) => canonicalizeTech(skill.name)).join(', ');
    case 'languages.list':
      return profile.languages
        .map((language) => `${language.name} (${language.level.toUpperCase()})`)
        .join(', ');
    default:
      return '';
  }
}
