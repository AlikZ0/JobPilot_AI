import { normalizeWhitespace } from '@/utils/text';
import { JobPilotError, ERROR_CODES } from '@/utils/errors';

/**
 * Извлечение текста из PDF резюме.
 *
 * pdf.js подгружается динамически: библиотека большая, а нужна только когда
 * пользователь действительно импортирует файл. Воркер тоже берётся из бандла
 * расширения — никакого кода из сети (docs/security.md).
 */

export interface ExtractedResume {
  text: string;
  pages: number;
  /** Символов текста на страницу — по этому видно скан вместо текстового PDF. */
  charsPerPage: number;
  /** true, когда в PDF почти нет текстового слоя: ATS такой файл не прочитает. */
  looksScanned: boolean;
}

/** Та часть API pdf.js, которой мы пользуемся. */
interface PdfjsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: { data: ArrayBuffer; isEvalSupported: boolean }): {
    promise: Promise<PdfDocument>;
  };
}

interface PdfDocument {
  numPages: number;
  getPage(index: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
  destroy(): Promise<void>;
}

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfjsModule;
  if (!workerConfigured) {
    // Воркер лежит рядом в сборке расширения.
    const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.toString();
    workerConfigured = true;
  }
  return pdfjs;
}

/**
 * Собирает строки страницы, ориентируясь на координаты: pdf.js отдаёт куски
 * текста, а не строки, и без этого резюме склеивается в одну простыню.
 */
function itemsToText(items: { str: string; transform: number[] }[]): string {
  const lines = new Map<number, { x: number; str: string }[]>();
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round((item.transform[5] ?? 0) / 3) * 3;
    const x = item.transform[4] ?? 0;
    const line = lines.get(y) ?? [];
    line.push({ x, str: item.str });
    lines.set(y, line);
  }
  return [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) =>
      normalizeWhitespace(
        parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.str)
          .join(' '),
      ),
    )
    .filter(Boolean)
    .join('\n');
}

export async function extractPdfText(file: ArrayBuffer): Promise<ExtractedResume> {
  let pdfjs;
  try {
    pdfjs = await loadPdfjs();
  } catch (error) {
    throw new JobPilotError(
      ERROR_CODES.EXTRACTION_FAILED,
      `Не удалось загрузить модуль чтения PDF: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const document = await pdfjs.getDocument({ data: file, isEvalSupported: false }).promise;
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items as { str: string; transform: number[] }[]));
    }
    await document.destroy();

    const text = pages.join('\n\n').trim();
    const charsPerPage = document.numPages === 0 ? 0 : Math.round(text.length / document.numPages);
    return {
      text,
      pages: document.numPages,
      charsPerPage,
      // Меньше 200 символов на страницу — это картинка, а не текст.
      looksScanned: charsPerPage < 200,
    };
  } catch (error) {
    throw new JobPilotError(
      ERROR_CODES.EXTRACTION_FAILED,
      `PDF не удалось прочитать: ${error instanceof Error ? error.message : String(error)}`,
      { hint: 'Файл может быть повреждён или защищён паролем. Попробуйте вставить текст вручную.' },
    );
  }
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsArrayBuffer(file);
  });
}
