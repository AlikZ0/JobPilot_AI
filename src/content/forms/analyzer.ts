import type { DetectedFormField, FormControlKind, FormFieldOption } from '@/types/application';
import { normalizeWhitespace, truncate } from '@/utils/text';

const FIELD_ID_ATTR = 'data-jobpilot-field';

let counter = 0;

function nextFieldId(): string {
  counter += 1;
  return `jp-field-${counter}`;
}

function isVisible(element: Element): boolean {
  const el = element as HTMLElement;
  if (el.hidden) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(el);
  if (
    style &&
    (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
  ) {
    return false;
  }
  if (typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    // happy-dom и jsdom возвращают нулевые прямоугольники — доверяем только реальной раскладке.
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return true;
    if (rect.width < 2 || rect.height < 2) return false;
  }
  return true;
}

function labelFor(element: Element): string {
  const doc = element.ownerDocument;
  const id = element.getAttribute('id');
  if (id) {
    const escaped =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    const label = doc.querySelector(`label[for="${escaped}"]`);
    const text = normalizeWhitespace(label?.textContent ?? '');
    if (text) return text;
  }
  const wrapping = element.closest('label');
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    for (const control of Array.from(clone.querySelectorAll('input,select,textarea')))
      control.remove();
    const text = normalizeWhitespace(clone.textContent ?? '');
    if (text) return text;
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((token) => normalizeWhitespace(doc.getElementById(token)?.textContent ?? ''))
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  // Запасной вариант: ближайший текст внутри группы, к которой относится поле.
  const group = element.closest('div,fieldset,li,section,td');
  if (group) {
    const legend = group.querySelector('legend,h1,h2,h3,h4,label,.label,[class*="label" i]');
    const text = normalizeWhitespace(legend?.textContent ?? '');
    if (text && text.length < 160) return text;
  }
  return '';
}

function surroundingText(element: Element): string {
  const container = element.closest('div,fieldset,li,section,form') ?? element.parentElement;
  if (!container) return '';
  const clone = container.cloneNode(true) as HTMLElement;
  for (const control of Array.from(clone.querySelectorAll('script,style,svg'))) control.remove();
  return truncate(normalizeWhitespace(clone.textContent ?? ''), 400);
}

function optionsOf(element: Element): FormFieldOption[] {
  if (element instanceof HTMLSelectElement || element.tagName === 'SELECT') {
    return Array.from((element as HTMLSelectElement).options)
      .slice(0, 200)
      .map((option) => ({
        value: option.value,
        label: normalizeWhitespace(option.textContent ?? ''),
      }));
  }
  return [];
}

function cssPath(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;
  let depth = 0;
  while (node && depth < 6) {
    let part = node.tagName.toLowerCase();
    const id = node.getAttribute('id');
    if (id) {
      part += `#${id}`;
      parts.unshift(part);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === node!.tagName,
      );
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
    depth += 1;
  }
  return parts.join(' > ');
}

function kindOf(element: Element): FormControlKind | null {
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (
    element.getAttribute('contenteditable') === 'true' ||
    element.getAttribute('role') === 'textbox'
  ) {
    return 'contenteditable';
  }
  if (tag !== 'input') return null;
  const type = (element.getAttribute('type') ?? 'text').toLowerCase();
  if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return null;
  if (type === 'checkbox') return 'checkbox';
  if (type === 'radio') return 'radio';
  if (type === 'file') return 'file';
  return 'input';
}

const SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';

/**
 * Обходит страницу (включая iframes того же origin) и описывает каждое поле
 * формы. Ничего лишнего не читает — только сообщает, что уже есть в DOM, чтобы
 * маппинг мог решить, что заполнять.
 */
export function analyzeForms(doc: Document): DetectedFormField[] {
  counter = 0;
  const fields: DetectedFormField[] = [];
  const roots: Document[] = [doc];
  for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
    try {
      const inner = (frame as HTMLIFrameElement).contentDocument;
      if (inner) roots.push(inner);
    } catch {
      // Iframe с другого origin — читать нечего и не нужно.
    }
  }

  for (const root of roots) {
    for (const element of Array.from(root.querySelectorAll(SELECTOR))) {
      const kind = kindOf(element);
      if (!kind) continue;
      const visible = isVisible(element);
      if (!visible) continue;
      const existing = element.getAttribute(FIELD_ID_ATTR);
      const fieldId = existing ?? nextFieldId();
      element.setAttribute(FIELD_ID_ATTR, fieldId);
      const input = element as HTMLInputElement;
      const maxLengthAttr = Number(element.getAttribute('maxlength'));
      fields.push({
        fieldId,
        kind,
        inputType: (element.getAttribute('type') ?? '').toLowerCase(),
        name: element.getAttribute('name') ?? '',
        idAttr: element.getAttribute('id') ?? '',
        label: labelFor(element),
        placeholder: element.getAttribute('placeholder') ?? '',
        ariaLabel: element.getAttribute('aria-label') ?? '',
        autocomplete: element.getAttribute('autocomplete') ?? '',
        surroundingText: surroundingText(element),
        required:
          element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
        maxLength: Number.isFinite(maxLengthAttr) && maxLengthAttr > 0 ? maxLengthAttr : null,
        options: optionsOf(element),
        currentValue:
          kind === 'checkbox' || kind === 'radio'
            ? String(Boolean(input.checked))
            : kind === 'contenteditable'
              ? normalizeWhitespace((element as HTMLElement).innerText ?? element.textContent ?? '')
              : (input.value ?? ''),
        selector: cssPath(element),
        groupName: element.getAttribute('name') ?? '',
        visible,
      });
    }
  }
  return fields;
}

export function findFieldElement(doc: Document, fieldId: string): HTMLElement | null {
  const direct = doc.querySelector<HTMLElement>(`[${FIELD_ID_ATTR}="${fieldId}"]`);
  if (direct) return direct;
  for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
    try {
      const inner = (frame as HTMLIFrameElement).contentDocument;
      const found = inner?.querySelector<HTMLElement>(`[${FIELD_ID_ATTR}="${fieldId}"]`);
      if (found) return found;
    } catch {
      // пропускаем фреймы с другого origin
    }
  }
  return null;
}

/** true, если на странице есть что-то похожее на форму отклика. */
export function hasApplicationForm(doc: Document): boolean {
  const fields = analyzeForms(doc);
  if (fields.length < 2) return false;
  const haystack = fields
    .map((field) => `${field.label} ${field.name} ${field.placeholder} ${field.autocomplete}`)
    .join(' ')
    .toLowerCase();
  return /name|email|resume|cv|cover|phone|apply|candidate/.test(haystack);
}

export { FIELD_ID_ATTR };
