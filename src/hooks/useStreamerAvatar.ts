import { useEffect, useState } from 'react';

export function useStreamerAvatar(channel?: string, enabled = true) {
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setAvatar(null); return; }
    const normalized = channel?.replace(/^#/, '').trim().toLowerCase();
    if (!normalized) { setAvatar(null); return; }
    const cacheKey = `streamer-avatar:${normalized}`;
    try { setAvatar(localStorage.getItem(cacheKey)); } catch { setAvatar(null); }
    const controller = new AbortController();
    let retryTimer: number | undefined;
    let refreshTimer: number | undefined;
    let loading = false;
    let retryDelay = 5000;
    const load = async () => {
      if (loading || controller.signal.aborted) return;
      loading = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      try {
        const response = await fetch('/api/streamer/avatar', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Avatar request failed: ${response.status}`);
        const data = await response.json() as { url?: string | null };
        if (!data.url?.startsWith('https://')) throw new Error('Avatar unavailable');
        setAvatar(data.url);
        try { localStorage.setItem(cacheKey, data.url); } catch {}
        retryDelay = 5000;
      } catch {
        if (!controller.signal.aborted) {
          retryTimer = window.setTimeout(load, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
        }
      } finally {
        loading = false;
      }
    };
    void load();
    refreshTimer = window.setInterval(() => { if (!controller.signal.aborted) void load(); }, 30 * 60_000);
    return () => {
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
    };
  }, [channel, enabled]);
  return avatar;
}
