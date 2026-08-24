import { useStore } from '../state/store';
import { Icon, type IconName } from './Icon';

const LEVEL_STYLE = {
  info: 'border-border bg-surface text-content',
  success: 'border-excellent/40 bg-surface text-content',
  warning: 'border-potential/40 bg-surface text-content',
  error: 'border-poor/40 bg-surface text-content',
} as const;

const LEVEL_ACCENT = {
  info: 'bg-brand/10 text-brand',
  success: 'bg-excellent/10 text-excellent',
  warning: 'bg-potential/10 text-potential',
  error: 'bg-poor/10 text-poor',
} as const;

const LEVEL_ICON: Record<keyof typeof LEVEL_STYLE, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'x',
};

export function Toasts() {
  const toasts = useStore((state) => state.toasts);
  const dismiss = useStore((state) => state.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-50 mx-auto flex max-w-[544px] flex-col gap-1.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`jp-animate-in pointer-events-auto flex items-start gap-2 rounded-xl border px-2.5 py-2 text-[12px] shadow-pop ${LEVEL_STYLE[toast.level]}`}
        >
          <span
            className={`mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${LEVEL_ACCENT[toast.level]}`}
          >
            <Icon name={LEVEL_ICON[toast.level]} size={12} strokeWidth={2.4} />
          </span>
          <p className="flex-1 leading-snug">{toast.message}</p>
          <button
            type="button"
            className="mt-px flex-shrink-0 rounded p-0.5 text-muted transition hover:bg-surface-3 hover:text-content"
            onClick={() => dismiss(toast.id)}
            aria-label="Закрыть уведомление"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
