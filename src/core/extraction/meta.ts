import { normalizeWhitespace } from '@/utils/text';

export interface MetaSnapshot {
  title: string;
  description: string;
  siteName: string;
  url: string;
  image: string;
}

function metaContent(doc: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    const content = element?.getAttribute('content') ?? element?.getAttribute('href') ?? '';
    if (content) return normalizeWhitespace(content);
  }
  return '';
}

/** Layer 2: Open Graph / Twitter / standard meta tags. */
export function readMeta(doc: Document): MetaSnapshot {
  return {
    title: metaContent(doc, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
    ]),
    description: metaContent(doc, [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]),
    siteName: metaContent(doc, ['meta[property="og:site_name"]', 'meta[name="application-name"]']),
    url: metaContent(doc, ['meta[property="og:url"]', 'link[rel="canonical"]']),
    image: metaContent(doc, ['meta[property="og:image"]']),
  };
}

/** Splits "Senior Node.js Developer at Example Inc." into title and company. */
export function splitTitleAndCompany(pageTitle: string): { title: string; company: string } {
  const cleaned = normalizeWhitespace(pageTitle);
  const atMatch = cleaned.match(/^(.*?)\s+(?:at|@|—|-|\||·)\s+(.+?)(?:\s*[|\-–]\s*[^|\-–]*)?$/i);
  if (atMatch) {
    return { title: normalizeWhitespace(atMatch[1]!), company: normalizeWhitespace(atMatch[2]!) };
  }
  return { title: cleaned, company: '' };
}
