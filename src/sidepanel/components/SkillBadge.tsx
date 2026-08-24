interface Props {
  name: string;
  kind: 'matched' | 'missing' | 'bonus' | 'neutral';
  onClick?: () => void;
}

const STYLES: Record<Props['kind'], string> = {
  matched: 'border-excellent/40 bg-excellent/10 text-excellent',
  missing: 'border-weak/40 bg-weak/10 text-weak',
  bonus: 'border-good/40 bg-good/10 text-good',
  neutral: '',
};

const PREFIX: Record<Props['kind'], string> = {
  matched: '✓',
  missing: '⚠',
  bonus: '+',
  neutral: '',
};

/** Skill chip. The glyph carries the meaning so colour is decorative only. */
export function SkillBadge({ name, kind, onClick }: Props) {
  const content = (
    <>
      {PREFIX[kind] ? (
        <span aria-hidden="true" className="font-bold">
          {PREFIX[kind]}
        </span>
      ) : null}
      <span>{name}</span>
    </>
  );
  const className = `jp-badge ${STYLES[kind]}`;
  if (!onClick) {
    return (
      <span className={className} title={`${kind}: ${name}`}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} title={`${kind}: ${name}`}>
      {content}
    </button>
  );
}
