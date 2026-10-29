/**
 * Route remote artwork through the local bot server. Apart from avoiding hot-link /
 * referrer restrictions in embedded browsers, this gives the Control Center a stable
 * same-origin URL and lets the server apply a short cache.
 */
export function artworkUrl(value?: string | null): string {
  const url = (value || '').trim();
  if (!url) return '';
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `/artwork-proxy?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return '';
  }
}
