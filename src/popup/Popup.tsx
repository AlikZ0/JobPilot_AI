import { useEffect, useState } from 'react';
import { MESSAGE_TYPES, type PageInfo } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { describeError, toSerializedError } from '@/utils/errors';
import { requestHostPermission } from '@/utils/permissions';
import { getSettings } from '@/database/repositories/settingsRepository';
import { listJobs } from '@/database/repositories/jobRepository';
import { Icon, Logo } from '@/sidepanel/components/Icon';

interface State {
  loading: boolean;
  pageInfo: PageInfo | null;
  tabId: number | null;
  hasPermission: boolean;
  restricted: boolean;
  hostname: string;
  jobsToday: number;
  message: string;
  error: string;
}

/** Небольшой лаунчер: основной интерфейс живёт в боковой панели. */
export function Popup() {
  const [state, setState] = useState<State>({
    loading: true,
    pageInfo: null,
    tabId: null,
    hasPermission: false,
    restricted: false,
    hostname: '',
    jobsToday: 0,
    message: '',
    error: '',
  });

  const load = async () => {
    try {
      const settings = await getSettings();
      document.documentElement.setAttribute(
        'data-theme',
        settings.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : settings.theme,
      );
      const [context, jobs] = await Promise.all([
        sendToBackground(MESSAGE_TYPES.GET_ACTIVE_TAB_CONTEXT, undefined),
        listJobs({ limit: 500 }),
      ]);
      const since = new Date().setHours(0, 0, 0, 0);
      setState((current) => ({
        ...current,
        loading: false,
        pageInfo: context.pageInfo,
        tabId: context.tabId,
        hasPermission: context.hasPermission,
        restricted: Boolean(context.restricted),
        hostname: context.hostname ?? '',
        jobsToday: jobs.filter((job) => (job.analyzedAt ?? 0) >= since).length,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: describeError(toSerializedError(error)),
      }));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openPanel = async () => {
    if (state.tabId === null) return;
    await chrome.sidePanel.open({ tabId: state.tabId });
    window.close();
  };

  /** Выбор сайтов живёт в настройках — это та же страница панели. */
  const openSites = async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/index.html#settings') });
    window.close();
  };

  const run = async (label: string, action: () => Promise<string>) => {
    setState((current) => ({ ...current, message: `${label}…`, error: '' }));
    try {
      const message = await action();
      setState((current) => ({ ...current, message }));
    } catch (error) {
      setState((current) => ({
        ...current,
        message: '',
        error: describeError(toSerializedError(error)),
      }));
    }
  };

  const pageSummary = state.pageInfo
    ? state.pageInfo.looksLikeJobPage
      ? 'вакансия найдена'
      : state.pageInfo.looksLikeListingPage
        ? `список вакансий: ${state.pageInfo.listingCount}`
        : 'вакансия на странице не распознана'
    : 'страницу не удалось прочитать';

  return (
    <div className="flex w-[320px] flex-col gap-2 bg-surface-2 p-3.5">
      <header className="mb-0.5 flex items-center gap-2">
        <Logo />
        <h1 className="text-[14px] font-semibold tracking-[-0.02em]">JobPilot AI</h1>
        <span className="jp-badge ml-auto text-muted" title="Проанализировано сегодня">
          <Icon name="target" size={11} />
          {state.jobsToday}
        </span>
      </header>

      {state.loading ? (
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="jp-spinner h-3 w-3" />
          Загрузка…
        </p>
      ) : state.restricted ? (
        <>
          <p className="text-[12px] leading-snug text-muted">
            Chrome не разрешает расширениям работать на служебных страницах. Откройте сайт с
            вакансиями или выберите площадки заранее.
          </p>
          <button type="button" className="jp-button-primary" onClick={() => void openSites()}>
            <Icon name="link" size={13} />
            Выбрать сайты
          </button>
        </>
      ) : !state.hasPermission ? (
        <>
          <p className="text-[12px] leading-snug text-muted">
            У JobPilot пока нет доступа к{' '}
            <span className="font-medium text-content">{state.hostname || 'этому сайту'}</span>.
            Доступ выдаётся отдельно для каждого сайта и отзывается в настройках.
          </p>
          <button
            type="button"
            className="jp-button-primary"
            onClick={() =>
              void run('Запрашиваем доступ', async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (!tab?.url) return 'Нет активной вкладки.';
                const granted = await requestHostPermission(tab.url);
                if (granted) await load();
                return granted ? 'Доступ выдан.' : 'В доступе отказано.';
              })
            }
          >
            <Icon name="key" size={13} />
            Выдать доступ к этому сайту
          </button>
          <button type="button" className="jp-button" onClick={() => void openSites()}>
            <Icon name="link" size={13} />
            Выбрать сайты
          </button>
        </>
      ) : (
        <>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-muted">
            <Icon name="link" size={12} />
            {state.pageInfo?.adapterId ?? state.hostname} · {pageSummary}
          </p>
          <button
            type="button"
            className="jp-button-primary"
            onClick={() =>
              void run('Анализируем', async () => {
                const result = await sendToBackground(MESSAGE_TYPES.ANALYZE_CURRENT_JOB, {
                  ...(state.tabId ? { tabId: state.tabId } : {}),
                });
                return `«${result.job.title || 'Вакансия'}» — ${result.analysis.score}%`;
              })
            }
          >
            <Icon name="target" size={13} />
            Анализировать эту вакансию
          </button>
          <button
            type="button"
            className="jp-button"
            onClick={() =>
              void run('Сохраняем', async () => {
                const result = await sendToBackground(MESSAGE_TYPES.SAVE_CURRENT_JOB, {
                  ...(state.tabId ? { tabId: state.tabId } : {}),
                });
                return `Сохранено: «${result.job.title}».`;
              })
            }
          >
            <Icon name="bookmark" size={13} />
            Сохранить вакансию
          </button>
        </>
      )}

      <button type="button" className="jp-button" onClick={() => void openPanel()}>
        <Icon name="dashboard" size={13} />
        Открыть боковую панель
      </button>

      {state.message ? (
        <p className="flex items-start gap-1.5 text-[11px] text-excellent">
          <Icon name="check" size={12} strokeWidth={2.4} />
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p className="flex items-start gap-1.5 text-[11px] text-poor">
          <Icon name="alert" size={12} />
          {state.error}
        </p>
      ) : null}

      <p className="mt-1 border-t border-border pt-2.5 text-[10px] leading-relaxed text-muted">
        Alt+Shift+A — анализ · Alt+Shift+S — сохранить · Alt+Shift+P — панель
      </p>
    </div>
  );
}
