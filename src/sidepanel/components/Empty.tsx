import { Icon, type IconName } from './Icon';

interface Props {
  title: string;
  hint?: string;
  icon?: IconName;
  action?: { label: string; onClick(): void };
}

/** Пустое состояние: иконка, что произошло и что можно сделать дальше. */
export function Empty({ title, hint, icon = 'search', action }: Props) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-card border border-border bg-surface-2 px-5 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted">
        <Icon name={icon} size={21} strokeWidth={1.6} />
      </span>
      <p className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</p>
      {hint ? <p className="max-w-[280px] text-[12px] leading-relaxed text-muted">{hint}</p> : null}
      {action ? (
        <button type="button" className="jp-button-primary mt-1" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
