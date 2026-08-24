import { JobPilotError, ERROR_CODES } from './errors';
import { isRestrictedUrl, originPattern } from './url';

/**
 * Доступ к сайтам запрашивается по требованию, а не при установке
 * (docs/privacy.md). chrome.permissions.request должен вызываться из
 * пользовательского жеста, поэтому его вызывает панель; фоновый воркер умеет
 * только проверять текущее состояние.
 */
export async function hasHostPermission(url: string): Promise<boolean> {
  const origin = originPattern(url);
  if (!origin) return false;
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function requestHostPermission(url: string): Promise<boolean> {
  if (isRestrictedUrl(url)) {
    throw new JobPilotError(
      ERROR_CODES.RESTRICTED_PAGE,
      'Chrome не разрешает расширениям доступ к этой странице.',
      { recoverable: false },
    );
  }
  const origin = originPattern(url);
  if (!origin) {
    throw new JobPilotError(ERROR_CODES.PERMISSION_DENIED, `Неподдерживаемый URL: ${url}`);
  }
  if (await hasHostPermission(url)) return true;
  return chrome.permissions.request({ origins: [origin] });
}

export async function removeHostPermission(url: string): Promise<boolean> {
  const origin = originPattern(url);
  if (!origin) return false;
  return chrome.permissions.remove({ origins: [origin] });
}

export async function listGrantedOrigins(): Promise<string[]> {
  const permissions = await chrome.permissions.getAll();
  return permissions.origins ?? [];
}

/** Понятное объяснение, которое показывается рядом с каждым разрешением в настройках. */
export const PERMISSION_EXPLANATIONS: { id: string; title: string; why: string }[] = [
  {
    id: 'storage',
    title: 'Хранилище',
    why: 'Хранит профиль, вакансии и настройки на этом устройстве. Никуда ничего не выгружается.',
  },
  {
    id: 'sidePanel',
    title: 'Боковая панель',
    why: 'Показывает интерфейс JobPilot рядом со страницей, которую вы смотрите.',
  },
  {
    id: 'activeTab',
    title: 'Активная вкладка',
    why: 'Читает вакансию в текущей вкладке — только когда вы нажимаете кнопку JobPilot.',
  },
  {
    id: 'scripting',
    title: 'Внедрение скрипта',
    why: 'Внедряет скрипт извлечения на страницу по требованию, вместо того чтобы работать везде.',
  },
  {
    id: 'tabs',
    title: 'Вкладки',
    why: 'Открывает фоновые вкладки во время массового анализа и закрывает их после.',
  },
  {
    id: 'notifications',
    title: 'Уведомления',
    why: 'Сообщает о вакансии с высоким совпадением. Можно выключить в настройках.',
  },
  {
    id: 'host_permissions',
    title: 'Доступ к сайтам (по требованию)',
    why: 'Выдаётся отдельно для каждого сайта, только когда вы там анализируете. Отозвать можно ниже.',
  },
];
