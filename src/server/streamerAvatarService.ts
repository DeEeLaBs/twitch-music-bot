const avatarCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname ? url.href : null;
  } catch { return null; }
}

export async function getStreamerAvatar(channel: string, clientId = '', oauthToken = ''): Promise<string | null> {
  const login = channel.replace(/^#/, '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(login)) return null;
  const cached = avatarCache.get(login);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const token = oauthToken.trim().replace(/^oauth:/i, '');
  if (clientId && token) {
    try {
      const response = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
        headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const body = await response.json() as { data?: Array<{ profile_image_url?: string }> };
        const url = imageUrl(body.data?.[0]?.profile_image_url);
        if (url) { avatarCache.set(login, { url, expiresAt: Date.now() + CACHE_MS }); return url; }
      }
    } catch { /* Public fallback below remains available without Twitch OAuth. */ }
  }

  try {
    const response = await fetch(`https://decapi.me/twitch/avatar/${encodeURIComponent(login)}`, { signal: AbortSignal.timeout(7000) });
    const url = response.ok ? imageUrl(await response.text()) : null;
    if (url) { avatarCache.set(login, { url, expiresAt: Date.now() + CACHE_MS }); return url; }
  } catch { /* Keep the last known image through transient network failures. */ }
  return cached?.url || null;
}
