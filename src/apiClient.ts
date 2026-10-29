let tokenPromise: Promise<string> | null = null;
let cachedSessionToken = '';

async function sessionToken(forceRefresh = false) {
  if (forceRefresh) { tokenPromise = null; cachedSessionToken = ''; }
  if (!tokenPromise) {
    tokenPromise = fetch('/api/session')
      .then(async response => {
        if (!response.ok) throw new Error('Session konnte nicht geladen werden.');
        const json = await response.json();
        const token = String(json.token || '');
        if (!token) throw new Error('Session-Token fehlt.');
        cachedSessionToken = token;
        return token;
      })
      .catch(error => {
        // A transient startup/network failure must not poison every later mutation.
        tokenPromise = null;
        throw error;
      });
  }
  return tokenPromise;
}

export async function primeConfigSession(): Promise<void> {
  await sessionToken();
}

export function sendConfigOnExit(patch: Record<string, unknown>): boolean {
  if (!cachedSessionToken || !Object.keys(patch).length) return false;
  try {
    void fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Session': cachedSessionToken },
      body: JSON.stringify(patch),
      keepalive: true
    }).catch(() => {});
    return true;
  } catch { return false; }
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const needsSession = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const send = async (refreshSession = false) => {
    const headers = new Headers(init.headers || {});
    if (needsSession) headers.set('X-Bot-Session', await sessionToken(refreshSession));
    return fetch(input, { ...init, headers });
  };

  let response = await send(false);
  // The token is process-local. If the bot server restarts while OBS/dashboard stays
  // open, transparently obtain the new token and retry the one local mutation once.
  if (needsSession && response.status === 403) response = await send(true);
  return response;
}
