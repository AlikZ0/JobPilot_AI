import { Icon, type IconName } from './Icon';

interface Props {
  name: string;
  kind: 'matched' | 'missing' | 'bonus' | 'neutral';
  onClick?: () => void;
}

const STYLES: Record<Props['kind'], string> = {
  matched: 'bg-excellent/10 text-excellent',
  missing: 'bg-weak/10 text-weak',
  bonus: 'bg-good/10 text-good',
  neutral: '',
};

const ICONS: Record<Props['kind'], IconName | null> = {
  matched: 'check',
  missing: 'alert',
  bonus: 'plus',
  neutral: null,
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
  const icon = ICONS[kind];
  const content = (
    <>
      {icon ? <Icon name={icon} size={11} strokeWidth={2.4} /> : null}
      <span>{name}</span>
    </>
  );
  const className = `jp-badge ${STYLES[kind]}${onClick ? ' jp-chip' : ''}`;
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
