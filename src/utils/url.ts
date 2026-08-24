/** Нормализация URL — общая для отпечатков, разрешений и адаптеров. */

const TRACKING_PARAM_RE =
  /^(utm_|gclid|fbclid|mc_|ref|refid|referrer|trk|trackingId|origin|eBP|savedSearchId|position|pageNum|src|source_id)/i;

export function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Убирает трекинговые параметры и нормализует регистр, чтобы одна и та же вакансия совпадала. */
export function normalizeUrl(value: string): string {
  const url = safeUrl(value);
  if (!url) return value.trim();
  url.hash = '';
  const keep: [string, string][] = [];
  url.searchParams.forEach((v, k) => {
    if (!TRACKING_PARAM_RE.test(k)) keep.push([k, v]);
  });
  url.search = '';
  keep.sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of keep) url.searchParams.append(k, v);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

export function hostnameOf(value: string): string {
  return safeUrl(value)?.hostname.replace(/^www\./, '') ?? '';
}

/** Шаблон origin, который принимает chrome.permissions.request. */
export function originPattern(value: string): string | null {
  const url = safeUrl(value);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  return `${url.protocol}//${url.hostname}/*`;
}

const RESTRICTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'devtools:',
  'view-source:',
];
const RESTRICTED_HOSTS = ['chrome.google.com', 'chromewebstore.google.com'];

export function isRestrictedUrl(value: string): boolean {
  const url = safeUrl(value);
  if (!url) return true;
  if (RESTRICTED_SCHEMES.includes(url.protocol)) return true;
  return RESTRICTED_HOSTS.includes(url.hostname);
}

export function absoluteUrl(href: string, base: string): string {
  const url = safeUrl(href) ?? safeUrl(new URL(href, base).toString());
  return url ? url.toString() : href;
}
