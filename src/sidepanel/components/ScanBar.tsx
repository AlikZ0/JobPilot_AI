import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { useStore, withBusy } from '../state/store';
import { Icon } from './Icon';

/** Живой прогресс массового анализа вакансий. */
export function ScanBar() {
  const scan = useStore((state) => state.scan);
  const refreshData = useStore((state) => state.refreshData);
  const active = ['running', 'paused', 'discovering', 'stopping'].includes(scan.state);

  if (!active && scan.state !== 'done') return null;

  const percent = scan.total === 0 ? 0 : Math.round((scan.processed / scan.total) * 100);
  const done = scan.state === 'done';

  return (
    <section
      className="jp-bar border-b px-4 py-2.5"
      aria-label="Прогресс анализа"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold">
          {done ? (
            <span className="text-excellent">
              <Icon name="checkCircle" size={14} />
            </span>
          ) : scan.state === 'paused' ? (
            <span className="text-potential">
              <Icon name="pause" size={14} />
            </span>
          ) : (
            <span className="jp-spinner h-3.5 w-3.5 border-brand/30 border-t-brand" />
          )}
          {done ? 'Анализ завершён' : 'Анализируем'}: {scan.processed} / {scan.total}
        </span>
        <span className="tabular-nums text-[12px] font-semibold text-brand">{percent}%</span>
      </div>

      <div
        className="jp-track mt-1.5"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={done ? 'bg-excellent' : 'bg-brand'} style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
        <span className="flex items-center gap-1 text-excellent">
          <Icon name="check" size={11} strokeWidth={2.4} />
          готово: {scan.succeeded}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="chevronRight" size={11} />
          пропущено: {scan.skipped}
        </span>
        <span className={`flex items-center gap-1 ${scan.failed > 0 ? 'text-poor' : ''}`}>
          <Icon name="alert" size={11} />
          ошибок: {scan.failed}
        </span>
      </p>

      {scan.currentTitle ? (
        <p className="mt-1 truncate text-[11px] text-muted">
          Сейчас: {scan.currentTitle}
          {scan.currentScore !== null ? ` — ${scan.currentScore}%` : ''}
        </p>
      ) : null}

      {active ? (
        <div className="mt-2 flex gap-1.5">
          {scan.state === 'paused' ? (
            <button
              type="button"
              className="jp-button jp-button-sm"
              onClick={() =>
                void withBusy('Продолжаем', async () => {
                  await sendToBackground(MESSAGE_TYPES.RESUME_JOB_SCAN, undefined);
                })
              }
            >
              <Icon name="play" size={12} />
              Продолжить
            </button>
          ) : (
            <button
              type="button"
              className="jp-button jp-button-sm"
              onClick={() =>
                void withBusy('Ставим на паузу', async () => {
                  await sendToBackground(MESSAGE_TYPES.PAUSE_JOB_SCAN, undefined);
                })
              }
            >
              <Icon name="pause" size={12} />
              Пауза
            </button>
          )}
          <button
            type="button"
            className="jp-button jp-button-sm"
            onClick={() =>
              void withBusy('Останавливаем', async () => {
                await sendToBackground(MESSAGE_TYPES.STOP_JOB_SCAN, undefined);
                await refreshData();
              })
            }
          >
            <Icon name="stop" size={12} />
            Остановить
          </button>
        </div>
      ) : null}
    </section>
  );
}
