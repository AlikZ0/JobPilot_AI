import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { requestHostPermission } from '@/utils/permissions';
import { useStore, withBusy } from '../state/store';
import { Icon } from './Icon';

/**
 * Действия для вкладки, которую сейчас смотрит пользователь. Доступ к сайту
 * запрашивается именно здесь: chrome.permissions.request требует жеста.
 */
export function PageActions() {
  const pageInfo = useStore((state) => state.pageInfo);
  const hasPermission = useStore((state) => state.hasHostPermission);
  const restricted = useStore((state) => state.tabRestricted);
  const navigate = useStore((state) => state.navigate);
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

  // Служебные страницы Chrome (chrome://, интернет-магазин, страницы самого
  // расширения) закрыты для всех расширений — доступ туда выдать нельзя.
  if (restricted) {
    return (
      <section className="jp-card flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span className="text-muted">
            <Icon name="info" size={15} />
          </span>
          Здесь расширения не работают
        </h2>
        <p className="text-[12px] leading-snug text-muted">
          Chrome закрывает служебные страницы (chrome://, интернет-магазин, страницы расширений) для
          всех расширений. Откройте сайт с вакансиями — и действия появятся здесь.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button-primary" onClick={() => navigate('settings')}>
            <Icon name="link" size={13} />
            Выбрать сайты
          </button>
          <button
            type="button"
            className="jp-button"
            onClick={() => void store.refreshTabContext()}
          >
            <Icon name="refresh" size={13} />
            Проверить заново
          </button>
        </div>
      </section>
    );
  }

  if (!hasPermission) {
    return (
      <section className="jp-card flex flex-col gap-2 border-brand/30 bg-brand/[0.06]">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span className="text-brand">
            <Icon name="shield" size={15} />
          </span>
          Этот сайт ещё не подключён
        </h2>
        <p className="text-[12px] leading-snug text-muted">
          JobPilot запрашивает доступ отдельно к каждому сайту. Пока вы не разрешите, страница не
          читается.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button-primary" onClick={() => void grantAccess()}>
            <Icon name="key" size={13} />
            Выдать доступ к этому сайту
          </button>
          <button type="button" className="jp-button" onClick={() => navigate('settings')}>
            <Icon name="link" size={13} />
            Выбрать сайты
          </button>
        </div>
      </section>
    );
  }

  if (!pageInfo) {
    return (
      <section className="jp-card flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted">
          <Icon name="search" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-snug text-muted">
            Откройте вакансию или страницу с результатами поиска, чтобы здесь появились действия.
          </p>
          <button
            type="button"
            className="jp-button jp-button-sm mt-2"
            onClick={() => void store.refreshTabContext()}
          >
            <Icon name="refresh" size={12} />
            Проверить страницу заново
          </button>
        </div>
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
    <section className="jp-card flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span className="text-brand">
              <Icon name="link" size={14} />
            </span>
            Текущая страница
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-muted">{pageInfo.hostname}</p>
        </div>
        <span className="jp-badge flex-shrink-0 text-muted">{pageInfo.adapterId}</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {pageInfo.looksLikeJobPage ? (
          <span className="jp-badge border-excellent/40 bg-excellent/10 text-excellent">
            <Icon name="check" size={11} strokeWidth={2.4} />
            вакансия найдена
          </span>
        ) : null}
        {pageInfo.looksLikeListingPage ? (
          <span className="jp-badge border-good/40 bg-good/10 text-good">
            <Icon name="list" size={11} />
            список: {pageInfo.listingCount}
          </span>
        ) : null}
        {!pageInfo.looksLikeJobPage && !pageInfo.looksLikeListingPage ? (
          <span className="jp-badge text-muted">
            <Icon name="info" size={11} />
            вакансия на странице не распознана
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="jp-button-primary"
          onClick={analyzeCurrent}
          disabled={Boolean(busy)}
        >
          <Icon name="target" size={13} />
          Анализировать эту вакансию
        </button>
        <button type="button" className="jp-button" onClick={saveCurrent} disabled={Boolean(busy)}>
          <Icon name="bookmark" size={13} />
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
          <Icon name="bolt" size={13} />
          Анализировать вакансии на странице
        </button>
      </div>
    </section>
  );
}
