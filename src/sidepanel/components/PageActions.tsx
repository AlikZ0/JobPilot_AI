import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { requestHostPermission } from '@/utils/permissions';
import { useStore, withBusy } from '../state/store';

/**
 * Действия для вкладки, которую сейчас смотрит пользователь. Доступ к сайту
 * запрашивается именно здесь: chrome.permissions.request требует жеста.
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
        store.pushToast({ level: 'success', message: 'Доступ к сайту выдан.' });
        await store.refreshTabContext();
      } else {
        store.pushToast({ level: 'warning', message: 'В доступе к сайту отказано.' });
      }
    } catch (error) {
      store.reportError(error);
    }
  };

  if (!hasPermission) {
    return (
      <section className="jp-card flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold">Этот сайт ещё не подключён</h2>
        <p className="text-[12px] text-muted">
          JobPilot запрашивает доступ отдельно к каждому сайту. Пока вы не разрешите, страница не
          читается.
        </p>
        <button type="button" className="jp-button-primary" onClick={() => void grantAccess()}>
          Выдать доступ к этому сайту
        </button>
      </section>
    );
  }

  if (!pageInfo) {
    return (
      <section className="jp-card">
        <p className="text-[12px] text-muted">
          Откройте вакансию или страницу с результатами поиска, чтобы здесь появились действия.
        </p>
        <button
          type="button"
          className="jp-button mt-2"
          onClick={() => void store.refreshTabContext()}
        >
          Проверить страницу заново
        </button>
      </section>
    );
  }

  const analyzeCurrent = () =>
    void withBusy('Анализируем вакансию', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.ANALYZE_CURRENT_JOB, {
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      if (!result) return;
      store.applyAnalysis(result.job, result.analysis);
      store.navigate('job', result.job.id);
      store.pushToast({
        level: 'success',
        message: `«${result.job.title || 'Вакансия'}» — совпадение ${result.analysis.score}%.`,
      });
    });

  const saveCurrent = () =>
    void withBusy('Сохраняем вакансию', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.SAVE_CURRENT_JOB, {
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      if (result) {
        await store.refreshData();
        store.pushToast({ level: 'success', message: `Сохранено: «${result.job.title}».` });
      }
    });

  const scanListing = () =>
    void withBusy('Запускаем анализ', async () => {
      const progress = await sendToBackground(MESSAGE_TYPES.START_JOB_SCAN, {
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      if (progress) {
        store.setScan(progress);
        store.pushToast({ level: 'info', message: `В работе вакансий: ${progress.total}.` });
      }
    });

  return (
    <section className="jp-card flex flex-col gap-2">
      <div>
        <h2 className="text-[13px] font-semibold">Текущая страница</h2>
        <p className="truncate text-[11px] text-muted">
          {pageInfo.adapterId} · {pageInfo.hostname}
          {pageInfo.looksLikeJobPage ? ' · вакансия' : ''}
          {pageInfo.looksLikeListingPage ? ` · список (${pageInfo.listingCount})` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="jp-button-primary"
          onClick={analyzeCurrent}
          disabled={Boolean(busy)}
        >
          Анализировать эту вакансию
        </button>
        <button type="button" className="jp-button" onClick={saveCurrent} disabled={Boolean(busy)}>
          Сохранить вакансию
        </button>
        <button
          type="button"
          className="jp-button"
          onClick={scanListing}
          disabled={Boolean(busy) || scanState === 'running' || !pageInfo.looksLikeListingPage}
          title={
            pageInfo.looksLikeListingPage
              ? 'Открыть каждую вакансию в фоновой вкладке и проанализировать'
              : 'Список вакансий на этой странице не найден'
          }
        >
          Анализировать вакансии на странице
        </button>
      </div>
    </section>
  );
}
