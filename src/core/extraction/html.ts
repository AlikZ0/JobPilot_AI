import { normalizeWhitespace } from '@/utils/text';

const BLOCK_TAGS = /<\/?(p|div|section|article|br|li|ul|ol|h[1-6]|tr|table|blockquote)[^>]*>/gi;

/**
 * Converts an HTML fragment (as found in JSON-LD descriptions) to plain text
 * without using innerHTML, so no markup from the page can ever be executed.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  if (!/[<&]/.test(html)) return normalizeWhitespace(html);
  const withBreaks = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withBreaks)
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1]!.length > 0))
    .join('\n')
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  eacute: 'é',
  euro: '€',
  pound: '£',
  deg: '°',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Visible text of an element, with block-level line breaks preserved. */
export function elementText(element: Element | null): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as Element;
  for (const node of Array.from(clone.querySelectorAll('script,style,noscript,svg,button'))) {
    node.remove();
  }
  for (const node of Array.from(clone.querySelectorAll('li'))) {
    node.textContent = `\n• ${normalizeWhitespace(node.textContent ?? '')}`;
  }
  for (const node of Array.from(clone.querySelectorAll('p,div,br,h1,h2,h3,h4,h5,h6,tr'))) {
    node.append('\n');
  }
  return (clone.textContent ?? '')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1]!.length > 0))
    .join('\n')
    .trim();
}
