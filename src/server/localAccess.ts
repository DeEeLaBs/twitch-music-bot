import type { IncomingHttpHeaders } from 'node:http';

const allowedHosts = new Set(['localhost:3000', '127.0.0.1:3000']);
const allowedOrigins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

function header(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Local dashboard, overlay, and OBS dock requests. Cross-site API calls stay blocked. */
export function isLocalDashboardRequest(req: { headers: IncomingHttpHeaders }) {
  if (!allowedHosts.has(header(req.headers, 'host') || '')) return false;
  const site = header(req.headers, 'sec-fetch-site');
  const mode = header(req.headers, 'sec-fetch-mode');
  const dest = header(req.headers, 'sec-fetch-dest');
  const origin = header(req.headers, 'origin');
  // OBS custom browser docks open the URL as a top-level page. CEF sends
  // Origin: null and sometimes Sec-Fetch-Site: cross-site for that navigation.
  if (mode === 'navigate' || dest === 'document') return true;
  const upgrade = (header(req.headers, 'upgrade') || '').toLowerCase();
  if (upgrade === 'websocket' && (!origin || origin === 'null')) return true;
  if (site === 'cross-site') return false;
  if (origin === 'null') return false;
  if (origin && !allowedOrigins.has(origin)) return false;
  return true;
}
