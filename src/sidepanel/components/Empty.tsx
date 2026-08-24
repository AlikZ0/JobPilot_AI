interface Props {
  title: string;
  hint?: string;
  action?: { label: string; onClick(): void };
}

export function Empty({ title, hint, action }: Props) {
  return (
    <div className="jp-card flex flex-col items-start gap-2 border-dashed">
      <p className="text-[13px] font-medium">{title}</p>
      {hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
      {action ? (
        <button type="button" className="jp-button-primary" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
