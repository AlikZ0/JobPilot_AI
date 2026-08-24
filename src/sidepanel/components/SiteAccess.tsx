import { useEffect, useState } from 'react';
import { listGrantedOrigins } from '@/utils/permissions';
import { useStore } from '../state/store';
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
  note?: string;
}

const KNOWN_SITES: KnownSite[] = [
  { id: 'linkedin', title: 'LinkedIn', domain: 'linkedin.com', note: 'отдельный адаптер' },
  { id: 'indeed', title: 'Indeed', domain: 'indeed.com', note: 'отдельный адаптер' },
  { id: 'glassdoor', title: 'Glassdoor', domain: 'glassdoor.com', note: 'отдельный адаптер' },
  { id: 'hh', title: 'hh.ru', domain: 'hh.ru' },
  { id: 'habr', title: 'Хабр Карьера', domain: 'career.habr.com' },
  { id: 'getmatch', title: 'getmatch', domain: 'getmatch.ru' },
  { id: 'superjob', title: 'SuperJob', domain: 'superjob.ru' },
  { id: 'avito', title: 'Авито Работа', domain: 'avito.ru' },
  { id: 'djinni', title: 'Djinni', domain: 'djinni.co' },
  { id: 'dou', title: 'DOU', domain: 'dou.ua' },
  { id: 'workua', title: 'Work.ua', domain: 'work.ua' },
  { id: 'wellfound', title: 'Wellfound', domain: 'wellfound.com' },
  { id: 'remoteok', title: 'Remote OK', domain: 'remoteok.com' },
  { id: 'wwr', title: 'We Work Remotely', domain: 'weworkremotely.com' },
  { id: 'otta', title: 'Otta', domain: 'otta.com' },
  { id: 'jobs', title: 'Google Jobs', domain: 'google.com', note: 'поиск вакансий в выдаче' },
];

/** Шаблон разрешения: домен вместе со всеми поддоменами. */
function patternFor(domain: string): string {
  return `https://*.${domain}/*`;
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
  return origins.some((origin) => {
    const host = origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
    const bare = host.replace(/^\*\./, '');
    return bare === domain || domain.endsWith(`.${bare}`) || host === domain;
  });
}

export function SiteAccess() {
  const [origins, setOrigins] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const pushToast = useStore((state) => state.pushToast);
  const reportError = useStore((state) => state.reportError);
  const refreshTabContext = useStore((state) => state.refreshTabContext);

  const reload = async () => setOrigins(await listGrantedOrigins());

  useEffect(() => {
    void reload();
  }, []);

  const grant = async (domain: string, title: string) => {
    try {
      const granted = await chrome.permissions.request({ origins: [patternFor(domain)] });
      await reload();
      await refreshTabContext();
      pushToast({
        level: granted ? 'success' : 'warning',
        message: granted ? `Доступ к ${title} выдан.` : `Доступ к ${title} не выдан.`,
      });
    } catch (error) {
      reportError(error);
    }
  };

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

  /** Домен мог быть выдан и через кнопку на странице (точный хост) — снимаем все совпадения. */
  const revokeDomain = async (domain: string, title: string) => {
    const matching = origins.filter((origin) => isGranted([origin], domain));
    await revoke(matching.length > 0 ? matching : [patternFor(domain)], title);
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

  const knownDomains = KNOWN_SITES.map((site) => site.domain);
  const extra = origins.filter((origin) => {
    const host = origin
      .replace(/^https?:\/\//, '')
      .replace(/\/\*$/, '')
      .replace(/^\*\./, '');
    return !knownDomains.some((domain) => domain === host || domain.endsWith(`.${host}`));
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-snug text-muted">
        Отметьте сайты, на которых JobPilot может читать вакансии. Chrome спросит подтверждение для
        каждого. Доступ можно отозвать в любой момент — на остальных сайтах расширение не работает.
      </p>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {KNOWN_SITES.map((site) => {
          const granted = isGranted(origins, site.domain);
          return (
            <li key={site.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
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
                  <span className="truncate">{site.title}</span>
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
