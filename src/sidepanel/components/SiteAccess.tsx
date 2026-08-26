import { useEffect, useMemo, useState } from 'react';
import { listGrantedOrigins } from '@/utils/permissions';
import { useStore } from '../state/store';
import {
  REMOTE_POLICIES,
  REMOTE_REGIONS,
  type RemoteCompany,
  type RemotePolicy,
  type RemoteRegion,
} from '../data/remoteCompanies';
import { REMOTE_POLICY_LABEL, REMOTE_REGION_LABEL } from '../labels';
import { Icon } from './Icon';

/**
 * Выбор сайтов, на которых JobPilot имеет право читать страницы.
 *
 * Доступ никогда не выдаётся при установке: здесь пользователь сам отмечает
 * нужные площадки, а Chrome показывает своё окно подтверждения. Запрос
 * обязан идти из клика — поэтому он живёт в панели, а не в фоновом воркере.
 */

interface KnownSite {
  id: string;
  title: string;
  /** Домен второго уровня; шаблон покрывает и поддомены (www, ru, jobs…). */
  domain: string;
  /** Куда ведёт ссылка на название сайта. */
  url: string;
  note?: string;
}

const KNOWN_SITES: KnownSite[] = [
  {
    id: 'linkedin',
    title: 'LinkedIn',
    domain: 'linkedin.com',
    url: 'https://www.linkedin.com/jobs/',
    note: 'отдельный адаптер',
  },
  {
    id: 'indeed',
    title: 'Indeed',
    domain: 'indeed.com',
    url: 'https://www.indeed.com/',
    note: 'отдельный адаптер',
  },
  {
    id: 'glassdoor',
    title: 'Glassdoor',
    domain: 'glassdoor.com',
    url: 'https://www.glassdoor.com/Job/',
    note: 'отдельный адаптер',
  },
  { id: 'hh', title: 'hh.ru', domain: 'hh.ru', url: 'https://hh.ru/search/vacancy' },
  {
    id: 'habr',
    title: 'Хабр Карьера',
    domain: 'career.habr.com',
    url: 'https://career.habr.com/vacancies',
  },
  {
    id: 'getmatch',
    title: 'getmatch',
    domain: 'getmatch.ru',
    url: 'https://getmatch.ru/vacancies',
  },
  {
    id: 'superjob',
    title: 'SuperJob',
    domain: 'superjob.ru',
    url: 'https://www.superjob.ru/vacancy/search/',
  },
  {
    id: 'avito',
    title: 'Авито Работа',
    domain: 'avito.ru',
    url: 'https://www.avito.ru/all/vakansii',
  },
  { id: 'djinni', title: 'Djinni', domain: 'djinni.co', url: 'https://djinni.co/jobs/' },
  { id: 'dou', title: 'DOU', domain: 'dou.ua', url: 'https://jobs.dou.ua/' },
  { id: 'workua', title: 'Work.ua', domain: 'work.ua', url: 'https://www.work.ua/jobs/' },
  {
    id: 'wellfound',
    title: 'Wellfound',
    domain: 'wellfound.com',
    url: 'https://wellfound.com/jobs',
  },
  { id: 'remoteok', title: 'Remote OK', domain: 'remoteok.com', url: 'https://remoteok.com/' },
  {
    id: 'wwr',
    title: 'We Work Remotely',
    domain: 'weworkremotely.com',
    url: 'https://weworkremotely.com/',
  },
  { id: 'otta', title: 'Otta', domain: 'otta.com', url: 'https://otta.com/jobs' },
  {
    id: 'jobs',
    title: 'Google Jobs',
    domain: 'google.com',
    url: 'https://www.google.com/search?q=jobs',
    note: 'поиск вакансий в выдаче',
  },
];

/** Шаблон разрешения: домен вместе со всеми поддоменами. */
function patternFor(domain: string): string {
  return `https://*.${domain}/*`;
}

/** Разрешение сразу на весь веб — то, что Chrome называет «на всех сайтах». */
const ALL_SITES_PATTERN = 'https://*/*';

function hasAllSites(origins: string[]): boolean {
  return origins.some(
    (origin) => origin === ALL_SITES_PATTERN || origin === 'http://*/*' || origin === '<all_urls>',
  );
}

/** Приводит ввод пользователя («hh.ru», «https://hh.ru/vacancy/1») к домену. */
export function domainFromInput(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./, '');
    if (!host.includes('.') || /\s/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function isGranted(origins: string[], domain: string): boolean {
  if (hasAllSites(origins)) return true;
  return origins.some((origin) => {
    const host = origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
    const bare = host.replace(/^\*\./, '');
    return bare === domain || domain.endsWith(`.${bare}`) || host === domain;
  });
}

/** Ссылка «открыть сайт» — одинаковая у площадок и у компаний. */
function SiteLink({ url, title }: { url: string; title: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 truncate transition-colors hover:text-brand"
      title={`Открыть ${title} в новой вкладке`}
    >
      <span className="truncate">{title}</span>
      <Icon name="external" size={11} className="opacity-60" />
    </a>
  );
}

/** Сколько компаний показываем за раз: восемьсот строк панель не переживёт. */
const PAGE_SIZE = 25;

export function SiteAccess() {
  const [origins, setOrigins] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const pushToast = useStore((state) => state.pushToast);
  const reportError = useStore((state) => state.reportError);
  const refreshTabContext = useStore((state) => state.refreshTabContext);

  const [query, setQuery] = useState('');
  const [policy, setPolicy] = useState<'all' | RemotePolicy>('all');
  const [region, setRegion] = useState<'all' | RemoteRegion>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const reload = async () => setOrigins(await listGrantedOrigins());

  useEffect(() => {
    void reload();
  }, []);

  // Восемьсот записей нужны только здесь, поэтому чанк подтягивается при
  // открытии настроек, а не вместе со всей панелью.
  const [companies, setCompanies] = useState<RemoteCompany[]>([]);
  useEffect(() => {
    let alive = true;
    void import('../data/remoteCompaniesList').then((module) => {
      if (alive) setCompanies(module.listRemoteCompanies());
    });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companies.filter((company) => {
      if (policy !== 'all' && company.policy !== policy) return false;
      if (region !== 'all' && company.region !== region) return false;
      if (!needle) return true;
      return company.name.toLowerCase().includes(needle) || company.domain.includes(needle);
    });
  }, [companies, query, policy, region]);

  // Новый набор — снова первая страница, иначе список остаётся «раскрытым».
  useEffect(() => setLimit(PAGE_SIZE), [query, policy, region]);

  const allSites = hasAllSites(origins);

  const request = async (patterns: string[], description: string) => {
    try {
      const granted = await chrome.permissions.request({ origins: patterns });
      await reload();
      await refreshTabContext();
      pushToast({
        level: granted ? 'success' : 'warning',
        message: granted ? `Доступ к ${description} выдан.` : `Доступ к ${description} не выдан.`,
      });
    } catch (error) {
      reportError(error);
    }
  };

  const grant = (domain: string, title: string) => request([patternFor(domain)], title);

  const revoke = async (patterns: string[], title: string) => {
    try {
      await chrome.permissions.remove({ origins: patterns });
      await reload();
      await refreshTabContext();
      pushToast({ level: 'info', message: `Доступ к ${title} отозван.` });
    } catch (error) {
      reportError(error);
    }
  };

  /**
   * Домен мог быть выдан и через кнопку на странице (точный хост) — снимаем все
   * совпадения. Разрешение на весь веб сюда не попадает: снять его «за компанию»
   * значило бы отобрать доступ и ко всем остальным сайтам.
   */
  const revokeDomain = async (domain: string, title: string) => {
    const matching = origins.filter(
      (origin) => !hasAllSites([origin]) && isGranted([origin], domain),
    );
    await revoke(matching.length > 0 ? matching : [patternFor(domain)], title);
  };

  /**
   * Одно разрешение на весь веб вместо восьмисот отдельных. Chrome покажет своё
   * предупреждение — здесь важно, чтобы человек понимал, что соглашается на
   * чтение любой страницы, а не только карьерных.
   */
  const grantAllSites = () => request([ALL_SITES_PATTERN], 'всем сайтам');

  /** Групповая выдача по текущему отбору: домены дедуплицируем — их делят ATS. */
  const grantFiltered = () => {
    const patterns = [...new Set(filtered.map((company) => patternFor(company.domain)))];
    if (patterns.length === 0) return;
    void request(patterns, `${patterns.length} сайтам компаний`);
  };

  const revokeEverything = async () => {
    if (origins.length === 0) return;
    await revoke(origins, 'всем сайтам');
  };

  const addCustom = () => {
    const domain = domainFromInput(custom);
    if (!domain) {
      pushToast({ level: 'warning', message: 'Не похоже на адрес сайта. Пример: hh.ru' });
      return;
    }
    setCustom('');
    void grant(domain, domain);
  };

  const knownDomains = [
    ...KNOWN_SITES.map((site) => site.domain),
    ...companies.map((company) => company.domain),
  ];
  const extra = origins.filter((origin) => {
    if (origin === ALL_SITES_PATTERN || origin === 'http://*/*') return false;
    const host = origin
      .replace(/^https?:\/\//, '')
      .replace(/\/\*$/, '')
      .replace(/^\*\./, '');
    return !knownDomains.some((domain) => domain === host || domain.endsWith(`.${host}`));
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-relaxed text-muted">
        Отметьте сайты, на которых JobPilot может читать вакансии. Chrome спросит подтверждение для
        каждого. Доступ можно отозвать в любой момент — на остальных сайтах расширение не работает.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {allSites ? (
          <button
            type="button"
            className="jp-button jp-button-sm"
            onClick={() => void revoke([ALL_SITES_PATTERN, 'http://*/*'], 'всем сайтам')}
          >
            <Icon name="lock" size={12} />
            Отключить доступ ко всем сайтам
          </button>
        ) : (
          <button
            type="button"
            className="jp-button jp-button-sm"
            onClick={() => void grantAllSites()}
          >
            <Icon name="shield" size={12} />
            Разрешить все сайты
          </button>
        )}
        {origins.length > 0 ? (
          <button
            type="button"
            className="jp-button-danger jp-button-sm"
            onClick={() => void revokeEverything()}
          >
            <Icon name="eraser" size={12} />
            Отозвать всё ({origins.length})
          </button>
        ) : null}
      </div>

      {allSites ? (
        <p className="flex items-start gap-1.5 rounded-control border border-potential/30 bg-potential/10 p-2.5 text-[11px] leading-relaxed">
          <span className="mt-px flex-shrink-0 text-potential">
            <Icon name="alert" size={13} />
          </span>
          <span>
            Сейчас выдан доступ ко всем сайтам. JobPilot по-прежнему читает страницу только по
            вашему действию, но право у него есть везде. Для повседневной работы надёжнее отметить
            конкретные площадки.
          </span>
        </p>
      ) : null}

      <section className="flex flex-col gap-1.5">
        <h4 className="jp-section-title">Сайты вакансий</h4>
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-2">
          {KNOWN_SITES.map((site) => {
            const granted = isGranted(origins, site.domain);
            return (
              <li key={site.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium">
                    {granted ? (
                      <span className="text-excellent">
                        <Icon name="checkCircle" size={12} />
                      </span>
                    ) : (
                      <span className="text-muted">
                        <Icon name="lock" size={12} />
                      </span>
                    )}
                    <SiteLink url={site.url} title={site.title} />
                  </p>
                  <p className="truncate text-[10px] text-muted">
                    {site.domain}
                    {site.note ? ` · ${site.note}` : ''}
                  </p>
                </div>
                {granted ? (
                  <button
                    type="button"
                    className="jp-button jp-button-sm flex-shrink-0"
                    disabled={allSites}
                    title={allSites ? 'Выдан доступ ко всем сайтам' : undefined}
                    onClick={() => void revokeDomain(site.domain, site.title)}
                  >
                    Отключить
                  </button>
                ) : (
                  <button
                    type="button"
                    className="jp-button-primary jp-button-sm flex-shrink-0"
                    onClick={() => void grant(site.domain, site.title)}
                  >
                    <Icon name="plus" size={12} />
                    Разрешить
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="jp-section-title">Компании с удалённой работой</h4>
        <p className="text-[11px] leading-relaxed text-muted">
          Карьерные страницы{companies.length > 0 ? ` ${companies.length}` : ''} компаний из
          открытого каталога{' '}
          <a
            href="https://remoteintech.company"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand hover:underline"
          >
            remoteintech.company
          </a>
          . Название открывает страницу вакансий, кнопка справа выдаёт JobPilot доступ к её домену.
        </p>

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={14} />
          </span>
          <input
            className="jp-input rounded-full border-transparent bg-surface-3 pl-9 pr-8 hover:border-transparent"
            type="search"
            placeholder="Название компании или домен"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Поиск по компаниям"
          />
          {query ? (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full text-muted transition hover:text-content"
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
            >
              <Icon name="xCircle" size={15} />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="jp-input text-[12px]"
            value={policy}
            onChange={(event) => setPolicy(event.target.value as 'all' | RemotePolicy)}
            aria-label="Формат удалённой работы"
          >
            <option value="all">Любой формат</option>
            {REMOTE_POLICIES.map((value) => (
              <option key={value} value={value}>
                {REMOTE_POLICY_LABEL[value]}
              </option>
            ))}
          </select>
          <select
            className="jp-input text-[12px]"
            value={region}
            onChange={(event) => setRegion(event.target.value as 'all' | RemoteRegion)}
            aria-label="Регион найма"
          >
            <option value="all">Любой регион</option>
            {REMOTE_REGIONS.map((value) => (
              <option key={value} value={value}>
                {REMOTE_REGION_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <p className="text-[11px] text-muted">
            Найдено: {filtered.length} из {companies.length}
          </p>
          <button
            type="button"
            className="jp-button jp-button-sm"
            onClick={grantFiltered}
            disabled={allSites || filtered.length === 0}
            title={
              allSites ? 'Выдан доступ ко всем сайтам' : 'Одно окно Chrome на весь текущий список'
            }
          >
            <Icon name="plus" size={12} />
            Разрешить всем найденным ({filtered.length})
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-card border border-border bg-surface-2 px-3 py-4 text-center text-[12px] text-muted">
            {companies.length === 0 ? 'Загружаем каталог…' : 'Под эти условия ничего не подходит.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-2">
            {filtered.slice(0, limit).map((company) => {
              const granted = isGranted(origins, company.domain);
              return (
                <li
                  key={`${company.name}-${company.domain}`}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12px] font-medium">
                      {granted ? (
                        <span className="flex-shrink-0 text-excellent">
                          <Icon name="checkCircle" size={12} />
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-muted">
                          <Icon name="lock" size={12} />
                        </span>
                      )}
                      <SiteLink url={company.url} title={company.name} />
                    </p>
                    <p className="truncate text-[10px] text-muted">
                      {company.domain} · {REMOTE_POLICY_LABEL[company.policy]} ·{' '}
                      {REMOTE_REGION_LABEL[company.region]}
                    </p>
                  </div>
                  {granted ? (
                    <button
                      type="button"
                      className="jp-button jp-button-sm flex-shrink-0"
                      disabled={allSites}
                      title={allSites ? 'Выдан доступ ко всем сайтам' : undefined}
                      onClick={() => void revokeDomain(company.domain, company.name)}
                    >
                      Отключить
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="jp-button-primary jp-button-sm flex-shrink-0"
                      onClick={() => void grant(company.domain, company.name)}
                    >
                      <Icon name="plus" size={12} />
                      Разрешить
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > limit ? (
          <button
            type="button"
            className="jp-button jp-button-sm self-center"
            onClick={() => setLimit((current) => current + PAGE_SIZE * 2)}
          >
            <Icon name="chevronDown" size={12} />
            Показать ещё ({filtered.length - limit})
          </button>
        ) : null}
      </section>

      <div>
        <label className="jp-label" htmlFor="jp-custom-site">
          Другой сайт
        </label>
        <div className="flex gap-1.5">
          <input
            id="jp-custom-site"
            className="jp-input"
            placeholder="например, jobs.example.com"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustom();
              }
            }}
          />
          <button
            type="button"
            className="jp-button flex-shrink-0"
            onClick={addCustom}
            disabled={custom.trim().length === 0}
          >
            <Icon name="plus" size={13} />
            Добавить
          </button>
        </div>
      </div>

      {extra.length > 0 ? (
        <div>
          <p className="jp-label">Другие разрешённые сайты</p>
          <ul className="flex flex-wrap gap-1">
            {extra.map((origin) => (
              <li key={origin} className="jp-badge gap-1.5">
                {origin}
                <button
                  type="button"
                  aria-label={`Отозвать доступ к ${origin}`}
                  className="rounded-full text-muted transition hover:text-poor"
                  onClick={() => void revoke([origin], origin)}
                >
                  <Icon name="x" size={11} strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
