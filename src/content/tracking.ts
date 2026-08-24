import { MESSAGE_TYPES } from '@/types/messages';
import type { SubmissionSignal } from '@/types/submission';
import { sendToBackground } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { normalizeWhitespace } from '@/utils/text';

const log = createLogger('tracking');

/**
 * Замечает, что пользователь отправил отклик на сайте, и сообщает об этом
 * фоновому воркеру. Здесь ничего не отправляется и не нажимается — только
 * наблюдение за тем, что сделал сам пользователь.
 */

/** Фразы, которые сайты показывают после успешной отправки отклика. */
const SUCCESS_PATTERNS: RegExp[] = [
  /спасибо за (ваш |твой )?отклик/i,
  /отклик (успешно )?(отправлен|доставлен|принят)/i,
  /зая?вка (успешно )?отправлена/i,
  /резюме (успешно )?отправлено/i,
  /ваш отклик (уже )?у работодателя/i,
  /application (has been |was )?(submitted|sent|received)/i,
  /thanks? (you )?for (applying|your application)/i,
  /we('ve| have) received your application/i,
  /your application is on its way/i,
];

/** Метки самого сайта: «вы уже откликались» на странице вакансии. */
const SITE_MARKER_PATTERNS: RegExp[] = [
  /^вы (уже )?откликались/i,
  /^вы откликнулись/i,
  /^отклик отправлен/i,
  /^ваш отклик/i,
  /^applied\b/i,
  /^you applied/i,
  /^application submitted/i,
];

/** Слова, по которым форма опознаётся как форма отклика, а не поиск или подписка. */
const APPLICATION_HINTS =
  /(отклик|ваканс|резюме|сопроводит|соискат|apply|applic|resume|cv\b|cover.?letter|candidate)/i;

const NEGATIVE_HINTS = /(подпис|рассылк|логин|войти|поиск|search|newsletter|subscribe|login)/i;

export function looksLikeSubmissionSuccess(text: string): boolean {
  const value = normalizeWhitespace(text);
  if (!value || value.length > 400) return false;
  return SUCCESS_PATTERNS.some((pattern) => pattern.test(value));
}

export function looksLikeSiteAppliedMarker(text: string): boolean {
  const value = normalizeWhitespace(text);
  // Метка сайта — короткая надпись; длинный текст почти наверняка описание.
  if (!value || value.length > 60) return false;
  return SITE_MARKER_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Форма похожа на форму отклика: несколько полей и хотя бы одно упоминание
 * отклика/резюме в подписях, при этом без явных признаков поиска или подписки.
 */
export function formLooksLikeApplication(form: HTMLFormElement): boolean {
  const controls = Array.from(form.querySelectorAll('input,textarea,select')).filter((control) => {
    const type = (control.getAttribute('type') ?? '').toLowerCase();
    return !['hidden', 'submit', 'button', 'image', 'reset'].includes(type);
  });
  if (controls.length < 2) return false;

  const haystack = [
    form.getAttribute('id') ?? '',
    form.getAttribute('name') ?? '',
    form.className,
    form.getAttribute('action') ?? '',
    form.getAttribute('aria-label') ?? '',
    ...controls.map((control) =>
      [
        control.getAttribute('name') ?? '',
        control.getAttribute('id') ?? '',
        control.getAttribute('placeholder') ?? '',
        control.getAttribute('aria-label') ?? '',
        control.getAttribute('autocomplete') ?? '',
      ].join(' '),
    ),
    normalizeWhitespace(form.textContent ?? '').slice(0, 600),
  ].join(' ');

  if (!APPLICATION_HINTS.test(haystack)) return false;
  // Форма отклика почти всегда содержит контакты — на этом отсекаются поиск и подписка.
  const hasContact = /(email|e-mail|почт|phone|телефон|name|имя|фамил)/i.test(haystack);
  if (!hasContact) return false;
  if (NEGATIVE_HINTS.test(haystack) && !/отклик|apply|applic|резюме|resume/i.test(haystack)) {
    return false;
  }
  return true;
}

let enabled = false;
/** Один сигнал на страницу: остальное схлопнет фоновый воркер. */
const reported = new Set<string>();
let sawApplicationForm = false;

async function report(signal: SubmissionSignal): Promise<void> {
  if (!enabled) return;
  const key = `${location.href}|${signal}`;
  if (reported.has(key)) return;
  reported.add(key);
  try {
    const result = await sendToBackground(MESSAGE_TYPES.SUBMISSION_DETECTED, {
      url: location.href,
      signal,
      title: document.title,
    });
    log.debug('сигнал об отклике отправлен', { signal, ...result });
  } catch (error) {
    // Панель могла быть закрыта, воркер — уснуть: тихо пропускаем.
    log.debug('сигнал об отклике не доставлен', error);
  }
}

function onSubmit(event: Event): void {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  try {
    if (!formLooksLikeApplication(form)) return;
    sawApplicationForm = true;
    void report('form_submit');
  } catch (error) {
    log.debug('не удалось разобрать отправленную форму', error);
  }
}

/**
 * Многие сайты отправляют отклик через fetch и просто перерисовывают блок.
 * Поэтому дополнительно ищем текст успеха — но только там, где до этого была
 * форма отклика или сайт сам показывает «вы откликались».
 */
function scanForMarkers(root: ParentNode): void {
  const candidates = root.querySelectorAll?.(
    'h1,h2,h3,h4,p,span,div[role="alert"],[role="status"],[class*="success" i],[class*="applied" i]',
  );
  if (!candidates) return;
  let index = 0;
  for (const element of Array.from(candidates)) {
    if (index++ > 400) break;
    const text = element.textContent ?? '';
    if (sawApplicationForm && looksLikeSubmissionSuccess(text)) {
      void report('success_page');
      return;
    }
    if (looksLikeSiteAppliedMarker(text)) {
      void report('site_marker');
      return;
    }
  }
}

let scanTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleScan(): void {
  if (!enabled) return;
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => scanForMarkers(document), 700);
}

/** Запускает наблюдение. Повторный вызов безопасен. */
export function startSubmissionTracking(hadApplicationForm: boolean): void {
  if (enabled) return;
  enabled = true;
  sawApplicationForm = hadApplicationForm;

  document.addEventListener('submit', onSubmit, true);

  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scheduleScan();
  log.debug('отслеживание откликов включено');
}

/** Сброс при смене URL в одностраничном приложении. */
export function resetSubmissionTracking(hadApplicationForm: boolean): void {
  reported.clear();
  sawApplicationForm = hadApplicationForm;
  scheduleScan();
}
