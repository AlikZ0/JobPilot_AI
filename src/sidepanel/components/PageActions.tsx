import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { requestHostPermission } from '@/utils/permissions';
import { useStore, withBusy } from '../state/store';

/**
 * Contextual actions for the tab the user is looking at. Site access is
 * requested here because chrome.permissions.request needs a user gesture.
 */
export function PageActions() {
  const pageInfo = useStore((state) => state.pageInfo);
  const hasPermission = useStore((state) => state.hasHostPermission);
  const activeTabId = useStore((state) => state.activeTabId);
  const busy = useStore((state) => state.busy);
  const scanState = useStore((state) => state.scan.state);
  const store = useStore();

  const grantAccess = async () => {
    const tab = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab[0]?.url;
    if (!url) return;
    try {
      const granted = await requestHostPermission(url);
      if (granted) {
        store.pushToast({ level: 'success', message: 'Site access granted.' });
        await store.refreshTabContext();
      } else {
        store.pushToast({ level: 'warning', message: 'Site access was declined.' });
      }
    } catch (error) {
      store.reportError(error);
    }
  };

  if (!hasPermission) {
    return (
      <section className="jp-card flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold">This site is not connected</h2>
        <p className="text-[12px] text-muted">
          JobPilot asks for access one site at a time. Nothing is read until you allow it.
        </p>
        <button type="button" className="jp-button-primary" onClick={() => void grantAccess()}>
          Grant access to this site
        </button>
      </section>
    );
  }

  if (!pageInfo) {
    return (
      <section className="jp-card">
        <p className="text-[12px] text-muted">
          Open a job posting or a search results page to use the actions here.
        </p>
        <button
          type="button"
          className="jp-button mt-2"
          onClick={() => void store.refreshTabContext()}
        >
          Re-check this page
        </button>
      </section>
    );
  }

  const analyzeCurrent = () =>
    void withBusy('Analyzing job', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.ANALYZE_CURRENT_JOB, {
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      if (!result) return;
      store.applyAnalysis(result.job, result.analysis);
      store.navigate('job', result.job.id);
      store.pushToast({
        level: 'success',
        message: `${result.job.title || 'Job'} scored ${result.analysis.score}%.`,
      });
    });

  const saveCurrent = () =>
    void withBusy('Saving job', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.SAVE_CURRENT_JOB, {
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      if (result) {
        await store.refreshData();
        store.pushToast({ level: 'success', message: `Saved "${result.job.title}".` });
      }
    });

  const scanListing = () =>
    void withBusy('Starting scan', async () => {
      const progress = await sendToBackground(MESSAGE_TYPES.START_JOB_SCAN, {
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      if (progress) {
        store.setScan(progress);
        store.pushToast({ level: 'info', message: `Scanning ${progress.total} postings.` });
      }
    });

  return (
    <section className="jp-card flex flex-col gap-2">
      <div>
        <h2 className="text-[13px] font-semibold">Current page</h2>
        <p className="truncate text-[11px] text-muted">
          {pageInfo.adapterId} · {pageInfo.hostname}
          {pageInfo.looksLikeJobPage ? ' · job posting' : ''}
          {pageInfo.looksLikeListingPage ? ` · listing (${pageInfo.listingCount})` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="jp-button-primary"
          onClick={analyzeCurrent}
          disabled={Boolean(busy)}
        >
          Analyze this job
        </button>
        <button type="button" className="jp-button" onClick={saveCurrent} disabled={Boolean(busy)}>
          Save job
        </button>
        <button
          type="button"
          className="jp-button"
          onClick={scanListing}
          disabled={Boolean(busy) || scanState === 'running' || !pageInfo.looksLikeListingPage}
          title={
            pageInfo.looksLikeListingPage
              ? 'Open each posting in a background tab and analyze it'
              : 'No job list detected on this page'
          }
        >
          Analyze jobs on this page
        </button>
      </div>
    </section>
  );
}
