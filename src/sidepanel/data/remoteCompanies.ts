/**
 * Типы каталога компаний, нанимающих удалённо. Сами записи лежат в
 * `remoteCompaniesList.ts` и подгружаются отдельным чанком: восемьсот строк
 * нужны только экрану настроек, а разбирать их при каждом открытии панели —
 * впустую.
 */

export const REMOTE_REGIONS = [
  'worldwide',
  'americas',
  'europe',
  'americas-europe',
  'asia-pacific',
  'other',
] as const;
export type RemoteRegion = (typeof REMOTE_REGIONS)[number];

/** Насколько компания действительно удалённая — от «только удалённо» до гибрида. */
export const REMOTE_POLICIES = [
  'fully-remote',
  'remote-first',
  'remote-friendly',
  'hybrid',
] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];

export interface RemoteCompany {
  name: string;
  /** Домен карьерной страницы — именно на него запрашивается доступ. */
  domain: string;
  /** Куда ведёт ссылка в настройках: страница вакансий или сайт компании. */
  url: string;
  region: RemoteRegion;
  policy: RemotePolicy;
}
