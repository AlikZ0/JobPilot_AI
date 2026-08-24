import { normalizeToken, normalizeWhitespace } from '@/utils/text';

/**
 * Детерминированная проверка резюме на совместимость с ATS
 * (Applicant Tracking System — системами, через которые работодатели
 * автоматически разбирают отклики).
 *
 * Здесь нет ни одного обращения к AI: всё это правила, которые можно
 * объяснить пользователю и проверить тестом.
 */

export const ATS_CHECK_IDS = [
  'text_layer',
  'contacts',
  'sections',
  'dates',
  'length',
  'layout',
  'glyphs',
  'file_name',
] as const;
export type AtsCheckId = (typeof ATS_CHECK_IDS)[number];

export type AtsSeverity = 'ok' | 'warning' | 'error';

export interface AtsCheck {
  id: AtsCheckId;
  title: string;
  severity: AtsSeverity;
  detail: string;
  /** Что конкретно сделать, если проверка не пройдена. */
  fix: string;
}

export interface AtsAudit {
  score: number;
  checks: AtsCheck[];
  /** Слова резюме — по ним считается плотность ключевых слов. */
  wordCount: number;
}

const SECTION_PATTERNS: { key: string; title: string; re: RegExp }[] = [
  {
    key: 'experience',
    title: 'Опыт работы',
    re: /(опыт работы|опыт|места работы|карьера|work experience|employment|professional experience)/i,
  },
  {
    key: 'skills',
    title: 'Навыки',
    re: /(навыки|技能|ключевые навыки|технологии|стек|skills|technical skills|tech stack)/i,
  },
  {
    key: 'education',
    title: 'Образование',
    re: /(образование|обучение|education|degree|университет|university)/i,
  },
];

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const DATE_RE = /(20\d{2}|19\d{2})\s*[–—-]\s*(20\d{2}|19\d{2}|наст|present|now|сейчас)/i;

/** Символы, которые ATS часто теряет или превращает в мусор. */
const RISKY_GLYPHS = /[•●▪‣⁃]|[-]|[\u{1F300}-\u{1FAFF}]|[─-╿]|[←-⇿]/gu;

/** Разделители колонок и таблиц: верный признак вёрстки, которую ATS ломает. */
const COLUMN_MARKERS = /[|│┃║]/g;

function check(
  id: AtsCheckId,
  title: string,
  severity: AtsSeverity,
  detail: string,
  fix: string,
): AtsCheck {
  return { id, title, severity, detail, fix };
}

export interface AtsAuditInput {
  text: string;
  /** Сколько символов текста на страницу — 0, если резюме вставлено вручную. */
  charsPerPage?: number;
  fileName?: string;
}

/**
 * Каждая проверка добавляет или снимает баллы: 100 — резюме, которое ATS
 * разберёт без потерь.
 */
export function auditResume(input: AtsAuditInput): AtsAudit {
  const text = input.text ?? '';
  const normalized = normalizeWhitespace(text);
  const words = normalized ? normalized.split(/\s+/).length : 0;
  const checks: AtsCheck[] = [];

  // 1. Текстовый слой.
  const charsPerPage = input.charsPerPage ?? text.length;
  if (text.trim().length === 0) {
    checks.push(
      check(
        'text_layer',
        'Текстовый слой',
        'error',
        'Текст резюме пуст.',
        'Загрузите текстовый PDF или вставьте текст резюме вручную.',
      ),
    );
  } else if (charsPerPage > 0 && charsPerPage < 200) {
    checks.push(
      check(
        'text_layer',
        'Текстовый слой',
        'error',
        'В PDF почти нет текста — похоже, это скан или картинка.',
        'Экспортируйте резюме из редактора в PDF, а не сканируйте: ATS не читает картинки.',
      ),
    );
  } else {
    checks.push(
      check('text_layer', 'Текстовый слой', 'ok', 'Текст в файле есть, ATS его прочитает.', ''),
    );
  }

  // 2. Контакты.
  const hasEmail = EMAIL_RE.test(text);
  const hasPhone = PHONE_RE.test(text);
  if (hasEmail && hasPhone) {
    checks.push(check('contacts', 'Контакты', 'ok', 'Есть почта и телефон.', ''));
  } else {
    const missing = [!hasEmail ? 'почты' : '', !hasPhone ? 'телефона' : ''].filter(Boolean);
    checks.push(
      check(
        'contacts',
        'Контакты',
        hasEmail || hasPhone ? 'warning' : 'error',
        `В резюме не нашлось ${missing.join(' и ')}.`,
        'Укажите контакты обычным текстом в начале резюме, не в колонтитуле и не картинкой.',
      ),
    );
  }

  // 3. Разделы.
  const missingSections = SECTION_PATTERNS.filter((section) => !section.re.test(text));
  if (missingSections.length === 0) {
    checks.push(check('sections', 'Разделы', 'ok', 'Опыт, навыки и образование подписаны.', ''));
  } else {
    checks.push(
      check(
        'sections',
        'Разделы',
        missingSections.length > 1 ? 'error' : 'warning',
        `Не найдены разделы: ${missingSections.map((section) => section.title).join(', ')}.`,
        'Используйте стандартные заголовки: «Опыт работы», «Навыки», «Образование».',
      ),
    );
  }

  // 4. Даты.
  if (DATE_RE.test(text)) {
    checks.push(check('dates', 'Даты', 'ok', 'Периоды работы указаны годами.', ''));
  } else {
    checks.push(
      check(
        'dates',
        'Даты',
        'warning',
        'Не нашлось периодов работы в формате «2021 — 2024».',
        'Пишите период каждой работы годами или в формате ММ.ГГГГ — ATS вычисляет по ним стаж.',
      ),
    );
  }

  // 5. Объём.
  if (words === 0) {
    checks.push(check('length', 'Объём', 'error', 'Текста нет.', 'Добавьте содержание резюме.'));
  } else if (words < 150) {
    checks.push(
      check(
        'length',
        'Объём',
        'warning',
        `Всего ${words} слов — для ATS это мало.`,
        'Опишите обязанности и результаты по каждому месту работы: 350–800 слов это норма.',
      ),
    );
  } else if (words > 1200) {
    checks.push(
      check(
        'length',
        'Объём',
        'warning',
        `${words} слов — резюме слишком длинное.`,
        'Оставьте последние 3–4 места работы и уберите повторы.',
      ),
    );
  } else {
    checks.push(check('length', 'Объём', 'ok', `${words} слов — нормальный объём.`, ''));
  }

  // 6. Вёрстка в колонки и таблицы.
  const columnHits = (text.match(COLUMN_MARKERS) ?? []).length;
  if (columnHits > 5) {
    checks.push(
      check(
        'layout',
        'Вёрстка',
        'warning',
        `Найдено ${columnHits} разделителей колонок или таблиц.`,
        'ATS читает документ сверху вниз: сделайте резюме в одну колонку без таблиц.',
      ),
    );
  } else {
    checks.push(check('layout', 'Вёрстка', 'ok', 'Признаков таблиц и колонок не видно.', ''));
  }

  // 7. Символы.
  const glyphHits = (text.match(RISKY_GLYPHS) ?? []).length;
  if (glyphHits > 12) {
    checks.push(
      check(
        'glyphs',
        'Символы',
        'warning',
        `${glyphHits} иконок и нестандартных символов.`,
        'Замените иконки и «звёздочки уровня» обычным текстом — ATS их теряет.',
      ),
    );
  } else {
    checks.push(check('glyphs', 'Символы', 'ok', 'Нестандартных символов немного.', ''));
  }

  // 8. Имя файла.
  const fileName = input.fileName ?? '';
  if (!fileName) {
    checks.push(
      check('file_name', 'Имя файла', 'ok', 'Проверка не нужна: текст вставлен вручную.', ''),
    );
  } else if (/^[\w .-]+\.pdf$/i.test(fileName) && fileName.length <= 60) {
    checks.push(check('file_name', 'Имя файла', 'ok', `«${fileName}» — подходит.`, ''));
  } else {
    checks.push(
      check(
        'file_name',
        'Имя файла',
        'warning',
        `«${fileName}» может сломать загрузку у части ATS.`,
        'Назовите файл латиницей и без спецсимволов, например Ivanov_Frontend.pdf.',
      ),
    );
  }

  const penalties = checks.reduce(
    (sum, item) => sum + (item.severity === 'error' ? 22 : item.severity === 'warning' ? 9 : 0),
    0,
  );
  return { score: Math.max(0, 100 - penalties), checks, wordCount: words };
}

/** Есть ли слово (или фраза) в тексте резюме — с учётом словоформ по границам. */
export function mentions(text: string, term: string): boolean {
  const haystack = ` ${normalizeToken(text)} `;
  const needle = normalizeToken(term);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9+#.])${escaped}(?![a-z0-9+#])`).test(haystack);
}
