import { MESSAGE_TYPES, type PageMark } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { normalizeUrl } from '@/utils/url';

const log = createLogger('badges');

/**
 * Метки JobPilot прямо на сайте: видно, куда уже был отклик и какой балл у
 * вакансии, без открытия панели. Всё рисуется отдельными элементами с
 * инлайновыми стилями и не трогает разметку сайта.
 */

const MARK_ATTR = 'data-jobpilot-mark';
const HOST_ID = 'jobpilot-page-badge';
const MAX_LINKS = 300;

/**
 * Системная палитра Apple в светлых тонах. Цвета заданы непрозрачными: метка
 * ложится на чужую страницу, фон под ней может быть любым.
 */
const COLORS = {
  submitted: { bg: '#e7f7ec', fg: '#1c7c3c', border: '#b9e6c8' },
  excellent: { bg: '#e7f7ec', fg: '#1c7c3c', border: '#b9e6c8' },
  good: { bg: '#e8f1fd', fg: '#0058b0', border: '#b6d4f7' },
  potential: { bg: '#fff4e0', fg: '#a35a00', border: '#ffd9a0' },
  weak: { bg: '#ffeee4', fg: '#b03d00', border: '#ffc9a8' },
  poor: { bg: '#ffeaea', fg: '#c00013', border: '#ffbdbd' },
  neutral: { bg: '#eaf2ff', fg: '#0060cc', border: '#c2dbff' },
} as const;

/** Тот же шрифтовой стек, что и в панели: сначала SF, потом системный. */
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

function paletteFor(mark: PageMark): (typeof COLORS)[keyof typeof COLORS] {
  if (mark.submittedAt) return COLORS.submitted;
  if (mark.score === null) return COLORS.neutral;
  if (mark.score >= 90) return COLORS.excellent;
  if (mark.score >= 75) return COLORS.good;
  if (mark.score >= 60) return COLORS.potential;
  if (mark.score >= 40) return COLORS.weak;
  return COLORS.poor;
}

function labelFor(mark: PageMark): string {
  if (mark.submittedAt) {
    const date = new Date(mark.submittedAt).toLocaleDateString();
    return `✓ отклик отправлен ${date}`;
  }
  if (mark.score !== null) return `JobPilot ${mark.score}%`;
  if (mark.state === 'saved') return 'сохранено в JobPilot';
  return 'есть в JobPilot';
}

function styleAsPill(element: HTMLElement, mark: PageMark, size: 'sm' | 'md'): void {
  const palette = paletteFor(mark);
  const declarations: Record<string, string> = {
    display: 'inline-flex',
    'align-items': 'center',
    gap: '4px',
    'margin-left': '6px',
    padding: size === 'sm' ? '1px 6px' : '3px 9px',
    'border-radius': '999px',
    border: `1px solid ${palette.border}`,
    background: palette.bg,
    color: palette.fg,
    'font-size': size === 'sm' ? '11px' : '12px',
    'font-weight': '600',
    'font-family': FONT_STACK,
    'letter-spacing': '-0.01em',
    'line-height': '1.4',
    'white-space': 'nowrap',
    'vertical-align': 'middle',
    'text-decoration': 'none',
  };
  for (const [property, value] of Object.entries(declarations)) {
    element.style.setProperty(property, value, 'important');
  }
}

function collectLinks(): { url: string; elements: HTMLAnchorElement[] }[] {
  const grouped = new Map<string, HTMLAnchorElement[]>();
  const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, MAX_LINKS * 3);
  for (const anchor of anchors) {
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    const href = anchor.href;
    if (!/^https?:/.test(href)) continue;
    if (anchor.hasAttribute(MARK_ATTR)) continue;
    const key = normalizeUrl(href);
    const list = grouped.get(key);
    if (list) list.push(anchor);
    else if (grouped.size < MAX_LINKS) grouped.set(key, [anchor]);
  }
  return [...grouped.entries()].map(([url, elements]) => ({ url, elements }));
}

function decorateLinks(marks: Map<string, PageMark>, links: ReturnType<typeof collectLinks>): void {
  for (const { url, elements } of links) {
    const mark = marks.get(url);
    if (!mark) continue;
    for (const anchor of elements) {
      if (anchor.hasAttribute(MARK_ATTR)) continue;
      anchor.setAttribute(MARK_ATTR, mark.jobId);
      const pill = document.createElement('span');
      pill.setAttribute(MARK_ATTR, 'pill');
      pill.textContent = labelFor(mark);
      pill.title = 'Метка JobPilot. Отключается в настройках расширения.';
      styleAsPill(pill, mark, 'sm');
      anchor.appendChild(pill);
    }
  }
}

function renderPageBadge(mark: PageMark | undefined): void {
  const existing = document.getElementById(HOST_ID);
  if (!mark) {
    existing?.remove();
    return;
  }
  if (existing?.getAttribute(MARK_ATTR) === `${mark.jobId}:${mark.submittedAt ?? ''}`) return;
  existing?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute(MARK_ATTR, `${mark.jobId}:${mark.submittedAt ?? ''}`);
  const styles: Record<string, string> = {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    'z-index': '2147483000',
    'pointer-events': 'auto',
  };
  for (const [property, value] of Object.entries(styles)) {
    host.style.setProperty(property, value, 'important');
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const palette = paletteFor(mark);
  const card = document.createElement('div');
  card.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:9px 12px',
    'border-radius:14px',
    `border:1px solid ${palette.border}`,
    `background:${palette.bg}`,
    `color:${palette.fg}`,
    `font:600 12px/1.4 ${FONT_STACK}`,
    'letter-spacing:-0.01em',
    'box-shadow:0 12px 32px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.08)',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = labelFor(mark);
  card.appendChild(text);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Скрыть метку JobPilot');
  close.style.cssText = [
    'border:0',
    'background:transparent',
    'cursor:pointer',
    'padding:0 2px',
    `font:600 12px/1 ${FONT_STACK}`,
    `color:${palette.fg}`,
    'opacity:.7',
  ].join(';');
  close.addEventListener('click', () => host.remove());
  card.appendChild(close);

  shadow.appendChild(card);
  document.body.appendChild(host);
}

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function refresh(): Promise<void> {
  if (!running || !document.body) return;
  const links = collectLinks();
  const urls = [normalizeUrl(location.href), ...links.map((entry) => entry.url)];
  try {
    const { marks } = await sendToBackground(MESSAGE_TYPES.GET_PAGE_MARKS, { urls });
    if (marks.length === 0) return;
    const byUrl = new Map(marks.map((mark) => [mark.url, mark]));
    decorateLinks(byUrl, links);
    renderPageBadge(byUrl.get(normalizeUrl(location.href)));
  } catch (error) {
    log.debug('метки не получены', error);
  }
}

function schedule(): void {
  if (!running) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void refresh(), 600);
}

export function startPageBadges(): void {
  if (running) return;
  running = true;
  const observer = new MutationObserver(() => schedule());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  log.debug('метки на странице включены');
}

/** Перерисовка после смены URL в одностраничном приложении. */
export function refreshPageBadges(): void {
  document.getElementById(HOST_ID)?.remove();
  schedule();
}
