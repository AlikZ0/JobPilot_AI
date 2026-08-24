import type { JobPriority, JobState } from '@/types/job';
import type { ApplicationState, FillDecision } from '@/types/application';
import type {
  EmploymentType,
  LanguageLevel,
  Seniority,
  SkillCategory,
  WorkMode,
} from '@/types/profile';
import type { FormFieldType } from '@/types/ai';
import type { Attachment } from '@/types/profile';

/**
 * Русские подписи для значений перечислений. Сами значения остаются
 * английскими: они хранятся в базе, ходят в сообщениях и проверяются схемами,
 * поэтому переводится только то, что видит пользователь.
 */

/**
 * Языки, на которых AI пишет тексты. Значение уходит в промпт как есть, поэтому
 * оно английское — модели надёжнее понимают «German», чем «Deutsch».
 */
export const GENERATION_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Same as the job posting', label: 'Как в вакансии' },
  { value: 'English', label: 'Английский — English' },
  { value: 'Russian', label: 'Русский' },
  { value: 'Ukrainian', label: 'Украинский — Українська' },
  { value: 'German', label: 'Немецкий — Deutsch' },
  { value: 'French', label: 'Французский — Français' },
  { value: 'Spanish', label: 'Испанский — Español' },
  { value: 'Italian', label: 'Итальянский — Italiano' },
  { value: 'Portuguese', label: 'Португальский — Português' },
  { value: 'Polish', label: 'Польский — Polski' },
  { value: 'Dutch', label: 'Нидерландский — Nederlands' },
  { value: 'Czech', label: 'Чешский — Čeština' },
  { value: 'Turkish', label: 'Турецкий — Türkçe' },
  { value: 'Armenian', label: 'Армянский — Հայերեն' },
  { value: 'Hebrew', label: 'Иврит — עברית' },
  { value: 'Arabic', label: 'Арабский — العربية' },
  { value: 'Chinese', label: 'Китайский — 中文' },
  { value: 'Japanese', label: 'Японский — 日本語' },
];

export const JOB_STATE_LABEL: Record<JobState, string> = {
  discovered: 'найдена',
  queued: 'в очереди',
  analyzing: 'анализируется',
  analyzed: 'проанализирована',
  saved: 'сохранена',
  application_preparing: 'готовится заявка',
  application_ready: 'заявка готова',
  submitted: 'отправлена',
  rejected: 'отклонена',
  error: 'ошибка',
};

export const JOB_PRIORITY_LABEL: Record<JobPriority, string> = {
  low: 'низкий',
  normal: 'обычный',
  high: 'высокий',
  critical: 'максимальный',
};

export const APPLICATION_STATE_LABEL: Record<ApplicationState, string> = {
  draft: 'Черновик',
  analyzing: 'Разбор формы',
  filling: 'Заполнение',
  review: 'На проверке',
  ready: 'Готова к отправке',
  submitted: 'Отправлена',
  failed: 'Ошибка',
  cancelled: 'Отменена',
};

export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: 'стажёр',
  junior: 'junior',
  mid: 'middle',
  senior: 'senior',
  lead: 'lead',
  principal: 'principal',
  director: 'директор',
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  remote: 'удалённо',
  hybrid: 'гибрид',
  office: 'офис',
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: 'полная занятость',
  part_time: 'частичная занятость',
  contract: 'контракт',
  freelance: 'фриланс',
  internship: 'стажировка',
  temporary: 'временная работа',
};

export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  frontend: 'фронтенд',
  backend: 'бэкенд',
  devops: 'devops',
  database: 'базы данных',
  other: 'прочее',
};

export const LANGUAGE_LEVEL_LABEL: Record<LanguageLevel, string> = {
  a1: 'A1',
  a2: 'A2',
  b1: 'B1',
  b2: 'B2',
  c1: 'C1',
  c2: 'C2',
  native: 'родной',
};

export const FILL_DECISION_LABEL: Record<FillDecision, string> = {
  auto: 'Заполнить',
  needs_confirmation: 'Спросить меня',
  skipped: 'Пропустить',
};

export const SEVERITY_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'низкая',
  medium: 'средняя',
  high: 'высокая',
};

const RED_FLAG_LABEL: Record<string, string> = {
  unrealistic_requirements: 'нереалистичные требования',
  very_broad_responsibilities: 'слишком широкий круг обязанностей',
  suspicious_salary: 'подозрительная зарплата',
  unpaid_position: 'неоплачиваемая позиция',
  commission_only: 'оплата только с процента',
  relocation_required: 'обязателен переезд',
  language_mismatch: 'несовпадение по языку',
  visa_restriction: 'ограничения по визе',
  mandatory_tech_missing: 'нет обязательной технологии',
  vague_description: 'расплывчатое описание',
  other: 'прочее',
};

export function redFlagLabel(code: string): string {
  return RED_FLAG_LABEL[code] ?? code.replace(/_/g, ' ');
}

const FIELD_TYPE_LABEL: Partial<Record<FormFieldType, string>> = {
  first_name: 'имя',
  last_name: 'фамилия',
  full_name: 'полное имя',
  email: 'email',
  phone: 'телефон',
  country: 'страна',
  city: 'город',
  address: 'адрес',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'портфолио',
  website: 'сайт',
  current_company: 'текущая компания',
  current_position: 'текущая должность',
  desired_position: 'желаемая должность',
  experience_years: 'лет опыта',
  current_salary: 'текущая зарплата',
  expected_salary: 'ожидаемая зарплата',
  notice_period: 'срок отработки',
  available_from: 'готов приступить',
  education: 'образование',
  skills: 'навыки',
  cover_letter: 'сопроводительное письмо',
  resume: 'резюме',
  work_authorization: 'право на работу',
  visa_sponsorship: 'спонсорство визы',
  relocation: 'переезд',
  remote_preference: 'формат работы',
  employment_type: 'тип занятости',
  languages: 'языки',
  gender: 'пол',
  ethnicity: 'этническая принадлежность',
  veteran_status: 'статус ветерана',
  disability_status: 'статус инвалидности',
  referral_source: 'откуда узнали',
  consent: 'согласие',
  open_question: 'открытый вопрос',
  unknown: 'не распознано',
};

export function fieldTypeLabel(type: FormFieldType): string {
  return FIELD_TYPE_LABEL[type] ?? type.replace(/_/g, ' ');
}

export const MAPPING_SOURCE_LABEL: Record<'deterministic' | 'ai' | 'user', string> = {
  deterministic: 'правило',
  ai: 'AI',
  user: 'вручную',
};

export const SALARY_PERIOD_LABEL: Record<'hour' | 'day' | 'month' | 'year', string> = {
  hour: 'в час',
  day: 'в день',
  month: 'в месяц',
  year: 'в год',
};

export const ATTACHMENT_KIND_LABEL: Record<Attachment['kind'], string> = {
  resume: 'резюме',
  cover_letter: 'сопроводительное письмо',
  portfolio: 'портфолио',
  certificate: 'сертификат',
  other: 'документ',
};
