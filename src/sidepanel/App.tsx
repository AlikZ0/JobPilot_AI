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
import { SettingsPage } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { ScanBar } from './components/ScanBar';

const TABS: { route: Route; label: string; icon: string }[] = [
  { route: 'dashboard', label: 'Обзор', icon: '◈' },
  { route: 'jobs', label: 'Вакансии', icon: '☰' },
  { route: 'applications', label: 'Заявки', icon: '✎' },
  { route: 'assistant', label: 'Ассистент', icon: '✦' },
  { route: 'profile', label: 'Профиль', icon: '☺' },
  { route: 'settings', label: 'Настройки', icon: '⚙' },
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
    void useStore.getState().init();
  }, []);
  useTheme();
  useBackgroundEvents();
  useTabWatcher();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-muted" role="status">
        Загружаем JobPilot…
      </div>
    );
  }

  if (route === 'onboarding') {
    return (
      <div className="h-full overflow-y-auto">
        <Onboarding />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-brand">
            ▲
          </span>
          <h1 className="text-[13px] font-semibold">JobPilot AI</h1>
        </div>
        {busy ? (
          <span className="text-[11px] text-muted" role="status">
            {busy}…
          </span>
        ) : null}
      </header>

      <ScanBar />

      <main className="flex-1 overflow-y-auto px-3 py-3">
        {route === 'dashboard' ? <Dashboard /> : null}
        {route === 'jobs' ? <Jobs /> : null}
        {route === 'job' ? <JobDetail /> : null}
        {route === 'applications' ? <Applications /> : null}
        {route === 'application' ? <ApplicationReview /> : null}
        {route === 'assistant' ? <Assistant /> : null}
        {route === 'profile' ? <Profile /> : null}
        {route === 'settings' ? <SettingsPage /> : null}
      </main>

      <nav className="grid grid-cols-6 border-t border-border" aria-label="Основная навигация">
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
              className={`flex flex-col items-center gap-0.5 py-1.5 text-[10px] transition ${
                active ? 'bg-surface-3 font-semibold text-brand' : 'text-muted hover:bg-surface-2'
              }`}
            >
              <span aria-hidden="true" className="text-[13px]">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      <Toasts />
    </div>
  );
}
