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

/** Подпись для title и скринридера — цвет и значок сами по себе смысла не дают. */
const KIND_LABEL: Record<Props['kind'], string> = {
  matched: 'есть у вас',
  missing: 'не хватает',
  bonus: 'бонус',
  neutral: 'навык',
};

/** Чип навыка. Смысл несёт значок, цвет — только оформление. */
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
  const title = `${KIND_LABEL[kind]}: ${name}`;
  if (!onClick) {
    return (
      <span className={className} title={title}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      {content}
    </button>
  );
}
