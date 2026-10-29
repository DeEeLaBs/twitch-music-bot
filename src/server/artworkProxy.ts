import { Router } from 'express';
import crypto from 'node:crypto';

export function createArtworkProxyRouter() {
  const router = Router();
  // Same-origin artwork proxy for the dashboard/OBS webviews. Spotify/YouTube image
  // CDNs can behave differently in embedded browsers; proxying avoids referrer/hotlink
  // issues and also prevents stale remote cache behaviour from breaking the Control Center.
  const artworkHosts = [
    'i.scdn.co', 'image-cdn-ak.spotifycdn.com', 'mosaic.scdn.co',
    'yt3.ggpht.com', 'i.ytimg.com', 'img.youtube.com', 'lh3.googleusercontent.com'
  ];
  function isAllowedArtworkHost(hostname: string) {
    const host = hostname.toLowerCase();
    return artworkHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  }
  interface CachedArtwork { buffer: Buffer; contentType: string; etag: string; expiresAt: number; }
  const artworkCache = new Map<string, CachedArtwork>();
  const inflightArtwork = new Map<string, Promise<CachedArtwork>>();
  const MAX_ARTWORK_CACHE = 120;
  function getCachedArtwork(url: string): CachedArtwork | null {
    const cached = artworkCache.get(url);
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) { artworkCache.delete(url); return null; }
    artworkCache.delete(url); artworkCache.set(url, cached);
    return cached;
  }
  function setCachedArtwork(url: string, buffer: Buffer, contentType: string): CachedArtwork {
    const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 16);
    const etag = `"${hash}"`;
    const entry: CachedArtwork = { buffer, contentType, etag, expiresAt: Date.now() + 300_000 };
    artworkCache.set(url, entry);
    while (artworkCache.size > MAX_ARTWORK_CACHE) { const oldest = artworkCache.keys().next().value; if (!oldest) break; artworkCache.delete(oldest); }
    return entry;
  }

  router.get('/artwork-proxy', async (req, res) => {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    let target: URL;
    try { target = new URL(raw); } catch { res.sendStatus(400); return; }
    if (!['http:', 'https:'].includes(target.protocol) || !isAllowedArtworkHost(target.hostname)) { res.sendStatus(403); return; }

    const ifNoneMatch = req.headers['if-none-match'];
    const cached = getCachedArtwork(raw);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('ETag', cached.etag);
      if (ifNoneMatch === cached.etag) { res.sendStatus(304); return; }
      res.send(cached.buffer);
      return;
    }

    try {
      let task = inflightArtwork.get(raw);
      if (!task) {
        task = (async () => {
          const upstream = await fetch(target, {
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'Mozilla/5.0 MusicBot/1.8.5', 'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
          });
          if (!upstream.ok || !upstream.body) throw new Error(`Upstream error ${upstream.status}`);
          const finalUrl = new URL(upstream.url);
          if (!isAllowedArtworkHost(finalUrl.hostname)) throw new Error('Host not allowed after redirect');
          const contentType = upstream.headers.get('content-type') || '';
          if (!contentType.toLowerCase().startsWith('image/')) throw new Error('Not an image');
          const length = Number(upstream.headers.get('content-length') || 0);
          const maxBytes = 8 * 1024 * 1024;
          if (Number.isFinite(length) && length > maxBytes) {
            await upstream.body.cancel();
            throw new Error('Image too large');
          }
          const reader = upstream.body.getReader();
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              if (bytes > maxBytes) {
                await reader.cancel();
                throw new Error('Image too large');
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          const buffer = Buffer.concat(chunks, bytes);
          return setCachedArtwork(raw, buffer, contentType);
        })();
        inflightArtwork.set(raw, task);
        void task.then(
          () => { inflightArtwork.delete(raw); },
          () => { inflightArtwork.delete(raw); }
        );
      }
      const entry = await task;
      res.setHeader('Content-Type', entry.contentType);
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('ETag', entry.etag);
      if (ifNoneMatch === entry.etag) { res.sendStatus(304); return; }
      res.send(entry.buffer);
    } catch {
      res.sendStatus(502);
    }
  });

  return router;
}
