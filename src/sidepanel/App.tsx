import { useEffect } from 'react';
import { MESSAGE_TYPES, type Envelope } from '@/types/messages';
import { useStore, type Route } from './state/store';
import { Toasts } from './components/Toasts';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { JobDetail } from './pages/JobDetail';
import { Profile } from './pages/Profile';
import { Applications } from './pages/Applications';
import { ApplicationReview } from './pages/ApplicationReview';
import { Assistant } from './pages/Assistant';
import { Resume } from './pages/Resume';
import { SettingsPage } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { ScanBar } from './components/ScanBar';
import { Icon, Logo, type IconName } from './components/Icon';

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'dashboard', label: 'Обзор', icon: 'dashboard' },
  { route: 'jobs', label: 'Вакансии', icon: 'briefcase' },
  { route: 'applications', label: 'Заявки', icon: 'send' },
  { route: 'resume', label: 'Резюме', icon: 'file' },
  { route: 'assistant', label: 'Ассистент', icon: 'sparkles' },
  { route: 'profile', label: 'Профиль', icon: 'user' },
  { route: 'settings', label: 'Настройки', icon: 'settings' },
];

function useTheme() {
  const theme = useStore((state) => state.settings?.theme ?? 'system');
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/** Подписка на сообщения фонового воркера (прогресс, анализы, уведомления). */
function useBackgroundEvents() {
  useEffect(() => {
    const listener = (raw: unknown) => {
      const envelope = raw as Envelope | undefined;
      if (!envelope?.type) return;
      const store = useStore.getState();
      switch (envelope.type) {
        case MESSAGE_TYPES.EVENT_SCAN_PROGRESS:
          store.setScan(envelope.payload as never);
          break;
        case MESSAGE_TYPES.EVENT_ANALYSIS_READY: {
          const payload = envelope.payload as { job: never; analysis: never };
          store.applyAnalysis(payload.job, payload.analysis);
          break;
        }
        case MESSAGE_TYPES.EVENT_JOB_UPDATED:
        case MESSAGE_TYPES.EVENT_DATA_CHANGED:
          void store.refreshData();
          break;
        case MESSAGE_TYPES.EVENT_TOAST:
          store.pushToast(envelope.payload as never);
          break;
        default:
          break;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
}

function useTabWatcher() {
  useEffect(() => {
    const refresh = () => void useStore.getState().refreshTabContext();
    chrome.tabs.onActivated.addListener(refresh);
    const updated = (_id: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.status === 'complete') refresh();
    };
    chrome.tabs.onUpdated.addListener(updated);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(updated);
    };
  }, []);
}

export default function App() {
  const ready = useStore((state) => state.ready);
  const route = useStore((state) => state.route);
  const busy = useStore((state) => state.busy);
  const navigate = useStore((state) => state.navigate);

  useEffect(() => {
    void useStore
      .getState()
      .init()
      .then(() => {
        // Попап открывает выбор сайтов ссылкой вида …/index.html#settings.
        const target = window.location.hash.replace('#', '');
        const store = useStore.getState();
        if (target === 'settings' && store.route !== 'onboarding') store.navigate('settings');
      });
  }, []);
  useTheme();
  useBackgroundEvents();
  useTabWatcher();

  if (!ready) {
    return (
      <div
        className="jp-fade-in flex h-[100dvh] flex-col items-center justify-center gap-3 text-muted"
        role="status"
      >
        <Logo size={36} />
        <span className="jp-spinner h-4 w-4" />
        <p className="text-[12px]">Загружаем JobPilot…</p>
      </div>
    );
  }

  if (route === 'onboarding') {
    return (
      <div className="mx-auto h-[100dvh] w-full max-w-[560px] overflow-y-auto">
        <Onboarding />
        <Toasts />
      </div>
    );
  }

  // max-w удерживает читаемую ширину, когда та же страница открыта во вкладке
  // (options_page), а не в узкой боковой панели.
  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[560px] flex-col">
      <header className="jp-bar z-20 flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo />
          <div className="min-w-0 leading-tight">
            <h1 className="text-[14px] font-semibold tracking-[-0.02em]">JobPilot AI</h1>
            <p className="truncate text-[10.5px] text-muted">Подбор вакансий по вашему профилю</p>
          </div>
        </div>
        {busy ? (
          <span
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand"
            role="status"
          >
            <span className="jp-spinner h-3 w-3 border-brand/25 border-t-brand" />
            {busy}…
          </span>
        ) : null}
      </header>

      <ScanBar />

      <main key={route} className="jp-fade-in flex-1 overflow-y-auto px-3.5 py-4">
        {route === 'dashboard' ? <Dashboard /> : null}
        {route === 'jobs' ? <Jobs /> : null}
        {route === 'job' ? <JobDetail /> : null}
        {route === 'applications' ? <Applications /> : null}
        {route === 'application' ? <ApplicationReview /> : null}
        {route === 'resume' ? <Resume /> : null}
        {route === 'assistant' ? <Assistant /> : null}
        {route === 'profile' ? <Profile /> : null}
        {route === 'settings' ? <SettingsPage /> : null}
      </main>

      {/* Панель вкладок как в приложениях Apple: полупрозрачная, без рамок и
          подчёркиваний — активную выделяет только цвет. */}
      <nav className="jp-bar border-t px-1 pb-1 pt-1" aria-label="Основная навигация">
        <div className="grid grid-cols-7">
          {TABS.map((tab) => {
            const active =
              route === tab.route ||
              (route === 'job' && tab.route === 'jobs') ||
              (route === 'application' && tab.route === 'applications');
            return (
              <button
                key={tab.route}
                type="button"
                onClick={() => navigate(tab.route)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-[3px] rounded-control py-1.5 text-[9.5px] leading-none transition duration-200 ease-apple active:scale-95 ${
                  active ? 'font-semibold text-brand' : 'text-muted hover:text-content'
                }`}
              >
                <Icon name={tab.icon} size={19} strokeWidth={active ? 2.1 : 1.6} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <Toasts />
    </div>
  );
}
