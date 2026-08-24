import { useStore } from '../state/store';

const LEVEL_STYLE = {
  info: 'border-border bg-surface-3',
  success: 'border-excellent/40 bg-excellent/10 text-excellent',
  warning: 'border-potential/40 bg-potential/10 text-potential',
  error: 'border-poor/40 bg-poor/10 text-poor',
} as const;

const LEVEL_GLYPH = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' } as const;

export function Toasts() {
  const toasts = useStore((state) => state.toasts);
  const dismiss = useStore((state) => state.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-50 flex flex-col gap-1.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`pointer-events-auto flex items-start gap-2 rounded-md border px-2.5 py-2 text-[12px] shadow-lg ${LEVEL_STYLE[toast.level]}`}
        >
          <span aria-hidden="true">{LEVEL_GLYPH[toast.level]}</span>
          <p className="flex-1">{toast.message}</p>
          <button
            type="button"
            className="text-muted hover:text-content"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
