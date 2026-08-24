import type { FieldMapping, FillResult, FillResultItem } from '@/types/application';
import { findFieldElement } from './analyzer';
import { normalizeToken } from '@/utils/text';

/**
 * Ставит значение так же, как это сделал бы живой пользователь, чтобы фреймворки
 * (React, Vue, Angular) заметили изменение. Никогда не нажимает кнопку отправки
 * и никогда не вызывает отправку формы программно.
 */
function setNativeValue(element: HTMLElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    (element as HTMLInputElement).value = value;
  }
}

function dispatch(element: HTMLElement, events: string[]): void {
  for (const type of events) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }
}

function fillTextLike(element: HTMLElement, value: string): boolean {
  element.focus?.();
  setNativeValue(element, value);
  dispatch(element, ['input', 'change']);
  element.blur?.();
  return true;
}

function fillContentEditable(element: HTMLElement, value: string): boolean {
  element.focus?.();
  element.textContent = value;
  dispatch(element, ['input', 'change']);
  element.blur?.();
  return true;
}

/** Выбирает вариант, подпись которого лучше всего совпадает со значением. */
function fillSelect(element: HTMLSelectElement, value: string): boolean {
  const target = normalizeToken(value);
  if (!target) return false;
  const options = Array.from(element.options);
  const exact = options.find(
    (option) =>
      normalizeToken(option.value) === target ||
      normalizeToken(option.textContent ?? '') === target,
  );
  const partial =
    exact ??
    options.find((option) => {
      const label = normalizeToken(option.textContent ?? '');
      return label.length > 0 && (label.includes(target) || target.includes(label));
    });
  if (!partial) return false;
  element.focus?.();
  element.value = partial.value;
  dispatch(element, ['input', 'change']);
  element.blur?.();
  return true;
}

function fillCheckbox(element: HTMLInputElement, value: string): boolean {
  const desired = ['true', 'yes', '1', 'on'].includes(value.trim().toLowerCase());
  if (element.checked === desired) return true;
  element.click();
  return element.checked === desired;
}

function fillRadioGroup(element: HTMLInputElement, value: string): boolean {
  const doc = element.ownerDocument;
  const name = element.getAttribute('name');
  const group = name
    ? Array.from(
        doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`),
      )
    : [element];
  const target = normalizeToken(value);
  for (const radio of group) {
    const label = normalizeToken(
      radio.labels?.[0]?.textContent ?? radio.getAttribute('aria-label') ?? radio.value,
    );
    if (
      label === target ||
      (label && target && (label.includes(target) || target.includes(label)))
    ) {
      radio.click();
      return radio.checked;
    }
  }
  return false;
}

/**
 * Применяет план заполнения. Записываются только поля, которые вызывающий код уже
 * одобрил (`decision === 'auto'`); остальные помечаются пропущенными, чтобы
 * боковая панель спросила пользователя.
 */
export function fillFields(doc: Document, mappings: FieldMapping[]): FillResult {
  const items: FillResultItem[] = [];
  let filled = 0;
  let skipped = 0;

  for (const mapping of mappings) {
    if (mapping.decision !== 'auto') {
      skipped += 1;
      items.push({
        fieldId: mapping.fieldId,
        filled: false,
        reason: `не одобрено (${mapping.decision})`,
      });
      continue;
    }
    const element = findFieldElement(doc, mapping.fieldId);
    if (!element) {
      skipped += 1;
      items.push({
        fieldId: mapping.fieldId,
        filled: false,
        reason: 'поля больше нет на странице',
      });
      continue;
    }
    if (!mapping.value) {
      skipped += 1;
      items.push({ fieldId: mapping.fieldId, filled: false, reason: 'в профиле нет значения' });
      continue;
    }

    let success = false;
    try {
      const tag = element.tagName.toLowerCase();
      const type = (element.getAttribute('type') ?? '').toLowerCase();
      if (tag === 'select') success = fillSelect(element as HTMLSelectElement, mapping.value);
      else if (type === 'checkbox')
        success = fillCheckbox(element as HTMLInputElement, mapping.value);
      else if (type === 'radio')
        success = fillRadioGroup(element as HTMLInputElement, mapping.value);
      else if (type === 'file') success = false;
      else if (element.getAttribute('contenteditable') === 'true')
        success = fillContentEditable(element, mapping.value);
      else success = fillTextLike(element, mapping.value);
    } catch (error) {
      success = false;
      items.push({
        fieldId: mapping.fieldId,
        filled: false,
        reason: error instanceof Error ? error.message : 'не удалось заполнить',
      });
      skipped += 1;
      continue;
    }

    if (success) {
      filled += 1;
      items.push({ fieldId: mapping.fieldId, filled: true, reason: 'заполнено' });
      highlight(element, 'filled');
    } else {
      skipped += 1;
      items.push({
        fieldId: mapping.fieldId,
        filled: false,
        reason:
          element.getAttribute('type') === 'file'
            ? 'файлы нужно прикреплять вручную'
            : 'подходящего варианта нет',
      });
    }
  }

  return { filled, skipped, items };
}

const HIGHLIGHT_STYLE_ID = 'jobpilot-highlight-style';

function ensureHighlightStyles(doc: Document): void {
  if (doc.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .jobpilot-filled { outline: 2px solid #4f46e5 !important; outline-offset: 1px; transition: outline-color .4s ease; }
    .jobpilot-attention { outline: 2px dashed #d97706 !important; outline-offset: 1px; }
  `;
  doc.head?.append(style);
}

export function highlight(element: HTMLElement, kind: 'filled' | 'attention'): void {
  const doc = element.ownerDocument;
  ensureHighlightStyles(doc);
  const className = kind === 'filled' ? 'jobpilot-filled' : 'jobpilot-attention';
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), 4000);
}

export function highlightField(doc: Document, fieldId: string): boolean {
  const element = findFieldElement(doc, fieldId);
  if (!element) return false;
  element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  highlight(element, 'attention');
  return true;
}
