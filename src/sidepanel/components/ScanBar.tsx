import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { useStore, withBusy } from '../state/store';

/** Live progress for the bulk "Analyze Jobs" run. */
export function ScanBar() {
  const scan = useStore((state) => state.scan);
  const refreshData = useStore((state) => state.refreshData);
  const active = ['running', 'paused', 'discovering', 'stopping'].includes(scan.state);

  if (!active && scan.state !== 'done') return null;

  const percent = scan.total === 0 ? 0 : Math.round((scan.processed / scan.total) * 100);

  return (
    <section
      className="border-b border-border bg-surface-2 px-3 py-2"
      aria-label="Scan progress"
      aria-live="polite"
    >
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold">
          {scan.state === 'done' ? 'Scan finished' : 'Analyzing'}: {scan.processed} / {scan.total}
        </span>
        <span className="text-muted">
          {scan.succeeded} ok · {scan.skipped} skipped · {scan.failed} failed
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
      </div>
      {scan.currentTitle ? (
        <p className="mt-1 truncate text-[11px] text-muted">
          Current: {scan.currentTitle}
          {scan.currentScore !== null ? ` — ${scan.currentScore}%` : ''}
        </p>
      ) : null}
      {active ? (
        <div className="mt-1.5 flex gap-1.5">
          {scan.state === 'paused' ? (
            <button
              type="button"
              className="jp-button"
              onClick={() =>
                void withBusy('Resuming', async () => {
                  await sendToBackground(MESSAGE_TYPES.RESUME_JOB_SCAN, undefined);
                })
              }
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              className="jp-button"
              onClick={() =>
                void withBusy('Pausing', async () => {
                  await sendToBackground(MESSAGE_TYPES.PAUSE_JOB_SCAN, undefined);
                })
              }
            >
              Pause
            </button>
          )}
          <button
            type="button"
            className="jp-button"
            onClick={() =>
              void withBusy('Stopping', async () => {
                await sendToBackground(MESSAGE_TYPES.STOP_JOB_SCAN, undefined);
                await refreshData();
              })
            }
          >
            Stop
          </button>
        </div>
      ) : null}
    </section>
  );
}
