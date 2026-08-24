import { useEffect, useState } from 'react';
import { MESSAGE_TYPES, type PageInfo } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { describeError, toSerializedError } from '@/utils/errors';
import { requestHostPermission } from '@/utils/permissions';
import { getSettings } from '@/database/repositories/settingsRepository';
import { listJobs } from '@/database/repositories/jobRepository';

interface State {
  loading: boolean;
  pageInfo: PageInfo | null;
  tabId: number | null;
  hasPermission: boolean;
  jobsToday: number;
  message: string;
  error: string;
}

/** Small launcher: the real UI lives in the side panel. */
export function Popup() {
  const [state, setState] = useState<State>({
    loading: true,
    pageInfo: null,
    tabId: null,
    hasPermission: false,
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

  return (
    <div className="flex w-[320px] flex-col gap-2 p-3">
      <header className="flex items-center gap-2">
        <span aria-hidden="true" className="text-brand">
          ▲
        </span>
        <h1 className="text-[13px] font-semibold">JobPilot AI</h1>
        <span className="ml-auto text-[11px] text-muted">{state.jobsToday} analyzed today</span>
      </header>

      {state.loading ? (
        <p className="text-[12px] text-muted">Loading…</p>
      ) : !state.hasPermission ? (
        <>
          <p className="text-[12px] text-muted">
            JobPilot has no access to this site yet. Access is granted per site and can be revoked
            in Settings.
          </p>
          <button
            type="button"
            className="jp-button-primary"
            onClick={() =>
              void run('Requesting access', async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (!tab?.url) return 'No active tab.';
                const granted = await requestHostPermission(tab.url);
                if (granted) await load();
                return granted ? 'Access granted.' : 'Access declined.';
              })
            }
          >
            Grant access to this site
          </button>
        </>
      ) : (
        <>
          <p className="truncate text-[11px] text-muted">
            {state.pageInfo
              ? `${state.pageInfo.adapterId} · ${state.pageInfo.looksLikeJobPage ? 'job posting' : state.pageInfo.looksLikeListingPage ? `listing (${state.pageInfo.listingCount})` : 'no posting detected'}`
              : 'Page not readable.'}
          </p>
          <button
            type="button"
            className="jp-button-primary"
            onClick={() =>
              void run('Analyzing', async () => {
                const result = await sendToBackground(MESSAGE_TYPES.ANALYZE_CURRENT_JOB, {
                  ...(state.tabId ? { tabId: state.tabId } : {}),
                });
                return `${result.job.title || 'Job'}: ${result.analysis.score}%`;
              })
            }
          >
            Analyze this job
          </button>
          <button
            type="button"
            className="jp-button"
            onClick={() =>
              void run('Saving', async () => {
                const result = await sendToBackground(MESSAGE_TYPES.SAVE_CURRENT_JOB, {
                  ...(state.tabId ? { tabId: state.tabId } : {}),
                });
                return `Saved "${result.job.title}".`;
              })
            }
          >
            Save this job
          </button>
        </>
      )}

      <button type="button" className="jp-button" onClick={() => void openPanel()}>
        Open side panel
      </button>

      {state.message ? <p className="text-[11px] text-excellent">{state.message}</p> : null}
      {state.error ? <p className="text-[11px] text-poor">{state.error}</p> : null}

      <p className="text-[10px] text-muted">
        Shortcuts: Alt+Shift+A analyze · Alt+Shift+S save · Alt+Shift+P panel
      </p>
    </div>
  );
}
