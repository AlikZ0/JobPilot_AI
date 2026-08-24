/**
 * Набор контурных иконок (24×24, stroke). Инлайн-SVG, потому что CSP
 * расширения запрещает внешние ресурсы, а иконочный шрифт — лишний вес.
 *
 * Иконка всегда декоративна: рядом обязательно есть текст или aria-label
 * у родителя, поэтому здесь стоит aria-hidden.
 */

export type IconName =
  | 'dashboard'
  | 'briefcase'
  | 'send'
  | 'sparkles'
  | 'user'
  | 'settings'
  | 'compass'
  | 'search'
  | 'pin'
  | 'money'
  | 'clock'
  | 'check'
  | 'checkCircle'
  | 'x'
  | 'xCircle'
  | 'alert'
  | 'info'
  | 'flag'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'external'
  | 'refresh'
  | 'bookmark'
  | 'play'
  | 'pause'
  | 'stop'
  | 'plus'
  | 'trash'
  | 'download'
  | 'upload'
  | 'shield'
  | 'bolt'
  | 'target'
  | 'trending'
  | 'list'
  | 'file'
  | 'palette'
  | 'bell'
  | 'key'
  | 'wallet'
  | 'database'
  | 'lock'
  | 'sliders'
  | 'message'
  | 'eraser'
  | 'link';

const PATHS: Record<IconName, string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  briefcase:
    'M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M3 13h18',
  send: 'M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4z',
  sparkles:
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15.5 8.5l-2 5-5 2 2-5z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12l3 3 5-6',
  x: 'M18 6 6 18M6 6l12 12',
  xCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6',
  alert:
    'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  play: 'M6 4l14 8-14 8z',
  pause: 'M9 4v16M15 4v16',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  target:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  trending: 'M22 7l-8.5 8.5-5-5L2 17M16 7h6v6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4',
  palette:
    'M12 21a9 9 0 1 1 0-18c4.97 0 9 3.58 9 8 0 2.21-1.79 4-4 4h-1.5a1.5 1.5 0 0 0-1.06 2.56A1.5 1.5 0 0 1 12 21zM7.5 11.5v.01M10 8v.01M14 8v.01M16.5 11v.01',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  key: 'M15.5 3a5.5 5.5 0 1 0-4.2 9.1L3 20.4V22h3v-2h2v-2h2l1.9-1.9A5.5 5.5 0 0 0 15.5 3zM17 7.5h.01',
  wallet:
    'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2zM17 13h.01',
  database:
    'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4',
  sliders: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4',
  message: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  eraser: 'M4 20h16M13.5 4.5 4 14l5 5h4l8-8z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};

interface Props {
  name: IconName;
  /** Размер в пикселях. По умолчанию 16 — под текст 12–13px. */
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className = '', strokeWidth = 1.8 }: Props) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`jp-icon ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Логотип: компас в скруглённом квадрате с градиентом бренда. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="jp-logo inline-flex items-center justify-center rounded-[7px] text-white"
      style={{ width: size, height: size }}
    >
      <Icon name="compass" size={Math.round(size * 0.62)} strokeWidth={2} />
    </span>
  );
}
