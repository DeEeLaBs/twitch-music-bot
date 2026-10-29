import fs from 'node:fs';
import path from 'node:path';
import { scheduleJsonWrite } from './atomicStore.ts';
import { CircuitBreaker } from './circuitBreaker.ts';
import { botEvents } from './eventBus.ts';
import { judgeTextMatch, prepareTextSearch, type TextMatchHints } from './textSearch.ts';
/**
 * YouTube Music / YouTube track resolver.
 * Text searches prefer actual song results from music.youtube.com first and
 * only fall back to normal YouTube video search when no usable song result is found.
 * A text query is retried as a cleaner artist/title phrase. A result is kept only
 * when it actually shares that phrase, then a specific miss is reported.
 */

export interface YtmSearchCandidate {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  audio: boolean;
  thumbnailUrl: string;
}

export interface ResolvedTrackInfo {
  channel?: string;
  videoId: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  thumbnailUrl: string;
  url: string;
  requestSource?: 'spotify' | 'youtube' | 'text';
  originalRequestUrl?: string;
  sourceTitle?: string;
  sourceArtist?: string;
  spotifyUri?: string;
}

type AnyObject = Record<string, any>;

export type ResolverErrorCode = 'EMPTY_QUERY' | 'NETWORK_ERROR' | 'NO_RESULTS' | 'INVALID_VIDEO' | 'UPSTREAM_CHANGED' | 'TIMEOUT' | 'SPOTIFY_METADATA' | 'SPOTIFY_UNSUPPORTED';

export class ResolverError extends Error {
  public readonly code: ResolverErrorCode;
  constructor(code: ResolverErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ResolverError';
  }
}

interface CacheEntry { expiresAt: number; value: ResolvedTrackInfo; }
interface NegativeCacheEntry { expiresAt: number; error: string; }
interface OEmbedPayload { title?: string; author_name?: string; thumbnail_url?: string; }
interface SpotifyOEmbedPayload { title?: string; thumbnail_url?: string; provider_name?: string; }
interface SpotifyMetadata { trackId: string; url: string; title: string; artist: string; duration?: number; thumbnailUrl?: string; }

export class YouTubeResolver {
  private static cache = new Map<string, CacheEntry>();
  private static cacheHits = 0;
  private static cacheMisses = 0;
  private static cachePreloaded = 0;
  private static lastError = '';
  private static negativeCache = new Map<string, NegativeCacheEntry>();
  private static inflight = new Map<string, Promise<ResolvedTrackInfo>>();
  private static breaker = new CircuitBreaker(4, 30000);
  private static persistentLoaded = false;
  private static persistentEnabled = true;
  private static readonly CACHE_TTL_MS = 20 * 60 * 1000;
  private static readonly NEGATIVE_TTL_MS = 90 * 1000;
  private static readonly MAX_CACHE_ENTRIES = 300;
  private static readonly MAX_NEGATIVE_CACHE_ENTRIES = 300;
  private static cacheFile() { return path.join(process.cwd(), 'data', 'search-cache.json'); }
  public static configure(options: { persistSearchCache?: boolean }) { this.persistentEnabled = options.persistSearchCache !== false; }

  /** Extract video ID from common YouTube and YouTube Music URL formats (including shorts and live). */
  public static extractVideoId(input: string): string | null {
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

    const watchMatch = trimmed.match(/(?:music\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch?.[1]) return watchMatch[1];

    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch?.[1]) return shortMatch[1];

    const pathMatch = trimmed.match(/(?:music\.)?youtube\.com\/(?:embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch?.[1]) return pathMatch[1];

    return null;
  }

  /** Extract a Spotify track ID without requiring the Spotify Web API. */
  public static extractSpotifyTrackId(input: string): string | null {
    const trimmed = input.trim();
    const uri = trimmed.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
    if (uri?.[1]) return uri[1];
    try {
      const url = new URL(trimmed);
      if (url.hostname.toLowerCase() !== 'open.spotify.com') return null;
      const match = url.pathname.match(/\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:\/|$)/i);
      return match?.[1] || null;
    } catch { return null; }
  }

  public static isSpotifyTrackRequest(input: string): boolean { return Boolean(this.extractSpotifyTrackId(input)); }
  public static isSpotifyRequest(input: string): boolean {
    const trimmed = input.trim();
    if (/^spotify:/i.test(trimmed)) return true;
    try { return new URL(trimmed).hostname.toLowerCase() === 'open.spotify.com'; } catch { return false; }
  }

  /** Resolve a query or URL to complete track metadata. */
  public static async resolve(queryOrUrl: string): Promise<ResolvedTrackInfo> {
    const trimmed = queryOrUrl.trim();
    if (!trimmed) throw new ResolverError('EMPTY_QUERY', 'Song query or URL cannot be empty');

    if (this.persistentEnabled) this.loadPersistentCache();

    const spotifyId = this.extractSpotifyTrackId(trimmed);
    if (spotifyId) {
      const spotifyKey = `spotify-song-first:${spotifyId}`;
      const cached = this.getCached(spotifyKey);
      if (cached) { this.cacheHits++; return { ...cached }; }
      const negative = this.negativeCache.get(spotifyKey);
      if (negative && negative.expiresAt > Date.now()) throw new ResolverError('NO_RESULTS', negative.error);
      if (negative) this.negativeCache.delete(spotifyKey);
      const existing = this.inflight.get(spotifyKey);
      if (existing) { this.cacheHits++; return { ...(await existing) }; }
      if (!this.breaker.canRun()) throw new ResolverError('NETWORK_ERROR', 'Song-Suche wurde nach mehreren Fehlern kurz pausiert. Bitte in einigen Sekunden erneut versuchen.');
      this.cacheMisses++;
      const task = this.resolveSpotifyTrack(trimmed, spotifyId)
        .then(result => {
          this.breaker.success();
          this.cache.set(spotifyKey, { value: result, expiresAt: Date.now() + this.CACHE_TTL_MS });
          this.trimCache();
          if (this.persistentEnabled) this.persistCache();
          return result;
        })
        .catch(error => {
          if (error instanceof ResolverError && error.code === 'NO_RESULTS') {
            this.breaker.success();
            this.negativeCache.set(spotifyKey, { error: error.message, expiresAt: Date.now() + this.NEGATIVE_TTL_MS });
            this.trimNegativeCache();
          } else this.breaker.failure();
          throw error;
        })
        .finally(() => this.inflight.delete(spotifyKey));
      this.inflight.set(spotifyKey, task);
      return { ...(await task) };
    }
    if (this.isSpotifyRequest(trimmed)) throw new ResolverError('SPOTIFY_UNSUPPORTED', 'Nur einzelne Spotify-Track-Links werden unterstützt.');

    const videoId = this.extractVideoId(trimmed);
    if (videoId) {
      const vidKey = `vid:${videoId}`;
      const cachedVid = this.getCached(vidKey);
      if (cachedVid) {
        this.cacheHits++;
        botEvents.emit('search:resolved', { query: trimmed, videoId: cachedVid.videoId, source: 'cache' });
        // Older cache entries stored oEmbed's "Artist - Song" parts backwards.
        const metadata = cachedVid.channel && this.normalizeSearchText(cachedVid.title) === this.normalizeSearchText(cachedVid.channel)
          && this.normalizeSearchText(cachedVid.artist) !== this.normalizeSearchText(cachedVid.channel)
          ? { ...cachedVid, title: cachedVid.artist, artist: cachedVid.channel } : cachedVid;
        return { ...metadata, requestSource: 'youtube', originalRequestUrl: /^https?:/i.test(trimmed) ? trimmed : metadata.url };
      }
      const existingVid = this.inflight.get(vidKey);
      if (existingVid) { this.cacheHits++; return { ...(await existingVid), requestSource: 'youtube' }; }
      this.cacheMisses++;
      const vidTask = this.resolveByVideoId(videoId)
        .then(result => {
          this.cache.set(vidKey, { value: result, expiresAt: Date.now() + this.CACHE_TTL_MS });
          this.trimCache();
          if (this.persistentEnabled) this.persistCache();
          return result;
        })
        .catch(err => { this.noteError(err); throw err; })
        .finally(() => this.inflight.delete(vidKey));
      this.inflight.set(vidKey, vidTask);
      const vidResult = await vidTask;
      return { ...vidResult, requestSource: 'youtube', originalRequestUrl: /^https?:/i.test(trimmed) ? trimmed : vidResult.url };
    }

    // A new key prevents older video-first cache entries from bypassing the
    // YouTube Music song search after an upgrade.
    const cacheKey = `song-first:${this.normalizeSearchText(trimmed)}`;
    const cached = this.getCached(cacheKey);
    if (cached) { this.cacheHits++; botEvents.emit('search:resolved',{query:trimmed,videoId:cached.videoId,source:'cache'}); return { ...cached }; }
    const negative = this.negativeCache.get(cacheKey);
    if (negative && negative.expiresAt > Date.now()) throw new ResolverError('NO_RESULTS', negative.error);
    if (negative) this.negativeCache.delete(cacheKey);
    const existing = this.inflight.get(cacheKey);
    if (existing) { this.cacheHits++; return { ...(await existing) }; }
    if (!this.breaker.canRun()) throw new ResolverError('NETWORK_ERROR','YouTube-Suche wurde nach mehreren Fehlern kurz pausiert. Bitte in einigen Sekunden erneut versuchen.');
    this.cacheMisses++;
    const task=(async()=>{
      try {
        const plan = prepareTextSearch(trimmed);
        const hints: TextMatchHints = { title: plan.titleHint, artist: plan.artistHint };
        if (!plan.scoringQuery || !plan.textQueries.length) throw new ResolverError('NO_RESULTS', 'Kein passender Song zu dieser Anfrage gefunden.');
        let musicResult: ResolvedTrackInfo | null = null;
        for (const variant of plan.textQueries) {
          musicResult = await this.searchYouTubeMusic(variant, plan.scoringQuery, hints);
          if (musicResult) break;
        }
        let result = musicResult;
        if (!result) {
          let network: ResolverError | null = null;
          for (const variant of plan.textQueries) {
            try {
              result = await this.searchYouTubeVideo(variant, plan.scoringQuery, hints);
              if (result) break;
            } catch (error) {
              if (error instanceof ResolverError && error.code === 'NETWORK_ERROR') { network = error; continue; }
              throw error;
            }
          }
          if (!result && network) throw network;
          if (!result) throw new ResolverError('NO_RESULTS', 'Kein passender Song zu dieser Anfrage gefunden.');
        }
        botEvents.emit('search:resolved',{query:trimmed,videoId:result.videoId,source:musicResult?'ytm':'youtube'});
        result.requestSource = 'text';
        this.breaker.success();
        // Do not retain a video fallback: a proper song may become available
        // on the next request, and the song search must always run first.
        if (musicResult) { this.cache.set(cacheKey,{value:result,expiresAt:Date.now()+this.CACHE_TTL_MS}); this.trimCache(); if(this.persistentEnabled) this.persistCache(); }
        return result;
      } catch(error) {
        if (error instanceof ResolverError && error.code === 'NO_RESULTS') this.breaker.success(); else this.breaker.failure();
        const message=error instanceof Error?error.message:String(error);
        botEvents.emit('search:failed',{query:trimmed,error:message});
        // Only cache deterministic misses. A temporary network failure should be retried
        // instead of being reclassified as NO_RESULTS for the next 90 seconds.
        if (error instanceof ResolverError && error.code === 'NO_RESULTS') {
          this.negativeCache.set(cacheKey,{error:message,expiresAt:Date.now()+this.NEGATIVE_TTL_MS});
          this.trimNegativeCache();
        }
        throw error;
      } finally { this.inflight.delete(cacheKey); }
    })();
    this.inflight.set(cacheKey,task);
    return { ...(await task) };
  }

  private static async resolveSpotifyTrack(originalInput: string, trackId: string): Promise<ResolvedTrackInfo> {
    const metadata = await this.fetchSpotifyMetadata(trackId);
    const query = metadata.artist ? `${metadata.artist} ${metadata.title}` : metadata.title;
    if (!query.trim()) throw new ResolverError('SPOTIFY_METADATA', 'Spotify-Metadaten konnten nicht ermittelt werden.');

    let source: 'ytm' | 'youtube' = 'ytm';
    let result = await this.searchYouTubeMusic(query);
    if (!result || !this.isLikelySpotifyMatch(metadata, result)) {
      source = 'youtube';
      result = await this.searchYouTubeVideo(query);
    }
    if (!result || !this.isLikelySpotifyMatch(metadata, result)) {
      throw new ResolverError('NO_RESULTS', 'Kein eindeutiger YouTube-Music-Treffer für den Spotify-Song gefunden.');
    }
    botEvents.emit('search:resolved',{query:`Spotify: ${metadata.artist ? metadata.artist + ' - ' : ''}${metadata.title}`,videoId:result.videoId,source});
    return {
      ...result,
      // Keep the original Spotify artwork for Spotify requests. The YouTube Music
      // candidate is only used as the fallback playback match and may expose a
      // different video thumbnail, which made the Control Center cover appear wrong.
      thumbnailUrl: metadata.thumbnailUrl || result.thumbnailUrl,
      requestSource: 'spotify',
      originalRequestUrl: metadata.url || originalInput,
      sourceTitle: metadata.title,
      sourceArtist: metadata.artist,
      spotifyUri: `spotify:track:${trackId}`
    };
  }

  private static async fetchSpotifyMetadata(trackId: string): Promise<SpotifyMetadata> {
    const url = `https://open.spotify.com/track/${trackId}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
    };
    let oembed: SpotifyOEmbedPayload = {};
    let html = '';
    const [oembedResult, embedResult] = await Promise.allSettled([
      fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000), headers }),
      fetch(`https://open.spotify.com/embed/track/${trackId}`, { signal: AbortSignal.timeout(8000), headers })
    ]);
    if (oembedResult.status === 'fulfilled' && oembedResult.value.ok) {
      try { oembed = await oembedResult.value.json() as SpotifyOEmbedPayload; } catch { /* continue with embed HTML */ }
    } else if (oembedResult.status === 'rejected') this.noteError(oembedResult.reason);
    if (embedResult.status === 'fulfilled' && embedResult.value.ok) {
      try { html = await embedResult.value.text(); } catch { /* continue with oEmbed */ }
    } else if (embedResult.status === 'rejected') this.noteError(embedResult.reason);
    if (!html && !oembed.title) {
      throw new ResolverError('NETWORK_ERROR', 'Spotify-Link konnte derzeit nicht gelesen werden. Bitte später erneut versuchen.');
    }

    const metaMap = new Map<string, string>();
    const metaRegex = /<meta\s+[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']*)["']|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']([^"']+)["']/gi;
    for (const match of html.matchAll(metaRegex)) {
      const prop = (match[1] || match[4] || '').toLowerCase();
      const content = match[2] || match[3] || '';
      if (prop && !metaMap.has(prop)) metaMap.set(prop, this.decodeHtml(content).trim());
    }
    const meta = (property: string) => metaMap.get(property.toLowerCase()) || '';

    const pageTitle = this.decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
    let title = this.decodeHtml(oembed.title || '').trim() || meta('og:title') || meta('twitter:title');
    let artist = '';

    let duration: number | undefined;

    // Spotify embeds currently include a Next.js data blob. Read it defensively by
    // property meaning instead of depending on one fixed nesting path.
    const nextDataRaw = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (nextDataRaw) {
      try {
        const entity = this.findSpotifyTrackEntity(JSON.parse(nextDataRaw), trackId);
        if (entity) {
          const nextTitle = typeof entity.title === 'string' ? entity.title : typeof entity.name === 'string' ? entity.name : '';
          let nextArtist = '';
          if (Array.isArray(entity.artists) && entity.artists.length > 0) {
            nextArtist = entity.artists
              .map((a: AnyObject) => (typeof a?.name === 'string' ? a.name.trim() : ''))
              .filter(Boolean)
              .join(', ');
          } else if (typeof entity.subtitle === 'string') {
            nextArtist = entity.subtitle.trim();
          } else if (typeof entity.artist === 'string') {
            nextArtist = entity.artist.trim();
          }
          if (typeof entity.duration === 'number' && Number.isFinite(entity.duration) && entity.duration > 0) {
            duration = Math.round(entity.duration / 1000);
          }
          if (nextTitle.trim()) title = nextTitle.trim();
          if (nextArtist.trim()) artist = nextArtist.trim();
        }
      } catch { /* public embed shape may change; continue with HTML fallbacks */ }
    }

    // Embed DOM subtitle fallback: <h2 ... data-testid="subtitle">...<a>ArtistName</a>...</h2>
    if (!artist) {
      const subtitleMatch = html.match(/data-testid=["']subtitle["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1];
      if (subtitleMatch) {
        const stripped = this.decodeHtml(subtitleMatch.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (stripped) artist = stripped;
      }
    }

    // Current public Spotify embed pages commonly expose "Song - song and lyrics by Artist | Spotify".
    const titleMatch = pageTitle.match(/^(.+?)\s+-\s+(?:song and lyrics|song|lyrics) by\s+(.+?)\s+\|\s+Spotify$/i);
    if (titleMatch) { title = titleMatch[1].trim(); artist = titleMatch[2].trim(); }

    const description = meta('og:description') || meta('twitter:description') || meta('description');
    if (!artist && description) {
      const listenMatch = description.match(/Listen to .+? on Spotify\.\s*(.+?)\s*[·•]\s*(?:Song|Single|Album)\b/i);
      if (listenMatch?.[1]) artist = listenMatch[1].trim();
      if (!artist) {
        const parts = description.split(/[·•]/).map(part => part.trim()).filter(Boolean);
        if (parts.length >= 2 && !/^listen to\b/i.test(parts[0])) artist = parts[0];
      }
    }

    if (!artist && title) {
      const byMatch = title.match(/^(.+?)\s+by\s+(.+)$/i);
      if (byMatch) { title = byMatch[1].trim(); artist = byMatch[2].trim(); }
    }
    title = title.replace(/\s*\|\s*Spotify\s*$/i, '').trim();
    if (!title || /spotify\s*[–-]\s*web player/i.test(title)) {
      throw new ResolverError('SPOTIFY_METADATA', 'Spotify-Metadaten konnten nicht ermittelt werden.');
    }
    return { trackId, url, title, artist, duration, thumbnailUrl: oembed.thumbnail_url };
  }

  private static isLikelySpotifyMatch(metadata: SpotifyMetadata, candidate: ResolvedTrackInfo): boolean {
    const norm = (value: string) => this.normalizeSearchText(value);
    const sourceTitle = norm(metadata.title);
    const targetTitle = norm(candidate.title);
    if (!sourceTitle || !targetTitle) return false;
    const titleTokens = new Set(sourceTitle.split(' ').filter(Boolean));
    const candidateTitleTokens = new Set(targetTitle.split(' ').filter(Boolean));
    const overlap = [...titleTokens].filter(token => candidateTitleTokens.has(token)).length;
    const titleRatio = overlap / Math.max(1, Math.min(titleTokens.size, candidateTitleTokens.size));
    const titleOk = sourceTitle === targetTitle || sourceTitle.includes(targetTitle) || targetTitle.includes(sourceTitle) || titleRatio >= 0.6;
    if (!titleOk) return false;
    if (!metadata.artist) return true;
    const sourceArtistTokens = new Set(norm(metadata.artist).split(' ').filter(Boolean));
    const targetCombined = new Set(norm(`${candidate.artist} ${candidate.channel || ''}`).split(' ').filter(Boolean));
    if (!sourceArtistTokens.size) return true;
    const artistOverlap = [...sourceArtistTokens].filter(token => targetCombined.has(token)).length;
    return artistOverlap / sourceArtistTokens.size >= 0.5;
  }

  private static findSpotifyTrackEntity(root: unknown, trackId: string): AnyObject | null {
    // Avoid recursive descent on third-party JSON: an unexpectedly deep payload should
    // never be able to exhaust the Node call stack. Pointer index avoids O(N) array shifts.
    const queue: unknown[] = [root];
    let head = 0;
    let visited = 0;
    while (head < queue.length && visited < 10000) {
      const node = queue[head++];
      visited++;
      if (!node || typeof node !== 'object') continue;
      if (!Array.isArray(node)) {
        const record = node as AnyObject;
        const uri = typeof record.uri === 'string' ? record.uri : '';
        const id = typeof record.id === 'string' ? record.id : '';
        const hasTitle = typeof record.title === 'string' || typeof record.name === 'string';
        const hasArtist = typeof record.subtitle === 'string' || typeof record.artist === 'string' || (Array.isArray(record.artists) && record.artists.length > 0);
        if ((uri === `spotify:track:${trackId}` || id === trackId) && hasTitle) return record;
        if (record.type === 'track' && hasTitle && hasArtist) return record;
        queue.push(...Object.values(record));
      } else queue.push(...node);
      if (head > 2000) {
        queue.splice(0, head);
        head = 0;
      }
    }
    return null;
  }

  private static decodeHtml(value: string): string {
    return value
      .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
  }

  public static getDiagnostics() {
    const total = this.cacheHits + this.cacheMisses;
    return {
      cacheEntries: this.cache.size,
      cachePreloaded: this.cachePreloaded,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: total > 0 ? `${Math.round((this.cacheHits / total) * 100)}%` : 'n/a',
      cacheTtlMinutes: Math.round(this.CACHE_TTL_MS / 60000),
      negativeCacheEntries: this.negativeCache.size,
      inFlight: this.inflight.size,
      circuitBreaker: this.breaker.diagnostics(),
      lastError: this.lastError
    };
  }

  /** Resolve track details using videoId via oEmbed + page metadata. */
  private static async resolveByVideoId(videoId: string): Promise<ResolvedTrackInfo> {
    const directUrl = `https://music.youtube.com/watch?v=${videoId}`;
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let title = 'YouTube Track';
    let artist = 'Various Artists';
    let channel = '';
    let duration = 0;
    let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`;
      const oembedRes = await fetch(oembedUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (oembedRes.ok) {
        const data = await oembedRes.json() as OEmbedPayload;
        if (data.title) title = data.title;
        if (data.author_name) { channel = data.author_name; artist = channel.replace(' - Topic', ''); }
        if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
      }
    } catch (error) { this.noteError(error); }

    try {
      const pageRes = await fetch(ytUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const durationMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
        if (durationMatch?.[1]) duration = Math.round(parseInt(durationMatch[1], 10) / 1000);
        if (!duration) {
          const secMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
          if (secMatch?.[1]) duration = parseInt(secMatch[1], 10);
        }

        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
            artist = parts[0].trim();
            title = this.cleanTitle(parts.slice(1).join(' - '));
          }
        }
      }
    } catch (error) { this.noteError(error); }

    if (!duration || title === 'YouTube Track') {
      throw new Error('Videodaten oder Dauer nicht verfügbar. Bitte einen anderen YouTube-Link versuchen.');
    }

    return { channel, videoId, title, artist, duration, thumbnailUrl, url: directUrl };
  }

  /**
   * Search music.youtube.com and deliberately select a result from a "Songs"/"Titel" shelf.
   * This avoids choosing a music video, live performance or unrelated YouTube video when a
   * canonical song result exists in YouTube Music.
   * scoringQuery, when set, rejects a top hit that does not share the requested title.
   */
  private static async searchYouTubeMusic(query: string, scoringQuery?: string, hints?: TextMatchHints): Promise<ResolvedTrackInfo | null> {
    try {
      const html = await this.fetchSearchDocument(`https://music.youtube.com/search?q=${encodeURIComponent(query)}`);
      let data = this.extractInitialData(html);
      let candidates = data ? this.collectYtmSongCandidates(data) : [];
      if (!candidates.length) {
        const apiData = await this.innertubeMusicSearch(query, html);
        if (apiData) candidates = this.collectYtmSongCandidates(apiData);
      }
      const phrase = scoringQuery || query;
      const pool = scoringQuery
        ? candidates.filter(candidate => judgeTextMatch(phrase, candidate.title, candidate.artist, hints).acceptable)
        : candidates;
      pool.sort((a, b) => judgeTextMatch(phrase, b.title, b.artist, hints).score - judgeTextMatch(phrase, a.title, a.artist, hints).score || Number(b.audio) - Number(a.audio));
      for (const candidate of pool.slice(0, 4)) {
        let duration = candidate.duration;
        if (!duration) duration = await this.lookupDuration(candidate.videoId);
        if (!duration) continue;
        return {
          channel: candidate.artist,
          videoId: candidate.videoId,
          title: candidate.title,
          artist: candidate.artist,
          duration,
          thumbnailUrl: candidate.thumbnailUrl,
          url: `https://music.youtube.com/watch?v=${candidate.videoId}`
        };
      }
    } catch (error) {
      this.noteError(error);
      // YouTube Music is best-effort; normal YouTube is the explicit fallback.
    }
    return null;
  }

  /** Songs shelf, top-result card, then typed audio/official video rows. Album shelves stay out. */
  public static collectYtmSongCandidates(root: unknown): YtmSearchCandidate[] {
    const primary: YtmSearchCandidate[] = [];
    const typed: YtmSearchCandidate[] = [];
    const queue: unknown[] = [root];
    let head = 0;
    let visited = 0;
    while (head < queue.length && visited < 20000) {
      const node = queue[head++];
      visited++;
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { queue.push(...node); continue; }
      const record = node as AnyObject;
      const card = this.candidateFromCard(record.musicCardShelfRenderer);
      if (card) primary.push(card);
      const shelf = record.musicShelfRenderer;
      if (shelf && this.isSongShelfHeading(this.textFromRuns(shelf.title?.runs || shelf.title))) {
        const contents = Array.isArray(shelf.contents) ? shelf.contents : [];
        for (const entry of contents) {
          const parsed = this.candidateFromListItem(entry?.musicResponsiveListItemRenderer);
          if (parsed) primary.push(parsed);
        }
      }
      const fallback = this.candidateFromListItem(record.musicResponsiveListItemRenderer);
      if (fallback && this.isFallbackMusicVideo(record.musicResponsiveListItemRenderer)) typed.push(fallback);
      queue.push(...Object.values(record));
      if (head > 2000) { queue.splice(0, head); head = 0; }
    }
    const seen = new Set<string>();
    const merged: YtmSearchCandidate[] = [];
    const push = (candidate: YtmSearchCandidate) => {
      if (seen.has(candidate.videoId) || merged.length >= 12) return;
      seen.add(candidate.videoId);
      merged.push(candidate);
    };
    for (const candidate of primary) push(candidate);
    if (merged.length < 4) for (const candidate of typed) push(candidate);
    return merged;
  }

  private static isSongShelfHeading(heading: string): boolean {
    const normalized = heading.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
    return /^(songs?|titel|tracks?|canciones|chansons|cancoes|brani|lieder|singles?)$/.test(normalized)
      || /^top[-\s]?(result|results|ergebnis|ergebnisse)$/.test(normalized);
  }

  private static musicVideoType(item: AnyObject | undefined): string {
    return item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';
  }

  private static isFallbackMusicVideo(item: AnyObject | undefined): boolean {
    const type = this.musicVideoType(item);
    return type === 'MUSIC_VIDEO_TYPE_ATV' || type === 'MUSIC_VIDEO_TYPE_OMV' || type === 'MUSIC_VIDEO_TYPE_UGC';
  }

  private static candidateFromCard(card: AnyObject | undefined): YtmSearchCandidate | null {
    if (!card) return null;
    const titleRuns = card.title?.runs;
    const videoId = titleRuns?.find((run: AnyObject) => run?.navigationEndpoint?.watchEndpoint?.videoId)?.navigationEndpoint?.watchEndpoint?.videoId
      || card.onTap?.watchEndpoint?.videoId
      || card.playbackEndpoint?.watchEndpoint?.videoId;
    const title = this.textFromRuns(card.title).trim();
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId) || !title) return null;
    const subtitle = this.textFromRuns(card.subtitle);
    const artist = this.extractMusicArtist(card.subtitle?.runs || []) || this.durationAwareArtist(subtitle);
    const type = titleRuns?.[0]?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';
    return this.finishCandidate(videoId, title, artist, `${subtitle} ${card.accessibility?.accessibilityData?.label || ''}`, type === 'MUSIC_VIDEO_TYPE_ATV' || /^song\b/i.test(subtitle), card.thumbnail);
  }

  private static candidateFromListItem(item: AnyObject | undefined): YtmSearchCandidate | null {
    if (!item) return null;
    const videoId = item.playlistItemData?.videoId
      || item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId
      || item.navigationEndpoint?.watchEndpoint?.videoId
      || item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.find((run: AnyObject) => run?.navigationEndpoint?.watchEndpoint?.videoId)?.navigationEndpoint?.watchEndpoint?.videoId;
    const title = this.textFromRuns(item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text).trim();
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId) || !title) return null;
    const bylineRuns = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    const byline = this.textFromRuns(bylineRuns);
    const fixed = this.textFromRuns(item.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text);
    const artist = this.extractMusicArtist(bylineRuns) || this.durationAwareArtist(byline);
    return this.finishCandidate(videoId, title, artist, `${fixed} ${byline} ${item.accessibility?.accessibilityData?.label || ''}`, this.musicVideoType(item) === 'MUSIC_VIDEO_TYPE_ATV', item.thumbnail);
  }

  private static durationAwareArtist(byline: string): string {
    const text = byline.split('•').map(part => part.trim()).find(part => part && !/^\d{4}$/.test(part) && !/\d+:\d{2}/.test(part) && !/^song$/i.test(part));
    return text || 'Various Artists';
  }

  private static finishCandidate(videoId: string, title: string, artist: string, durationText: string, audio: boolean, thumbnail: AnyObject | undefined): YtmSearchCandidate {
    const thumbnails = thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    return {
      videoId,
      title: this.cleanTitle(title),
      artist: artist || 'Various Artists',
      duration: this.durationFromText(durationText),
      audio,
      thumbnailUrl: Array.isArray(thumbnails) && thumbnails.length ? thumbnails[thumbnails.length - 1]?.url : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  }

  private static durationFromText(value: string): number {
    const clock = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value);
    if (clock) {
      if (clock[3]) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
      return Number(clock[1]) * 60 + Number(clock[2]);
    }
    const words = /(\d+)\s*(?:minutes?|minuten|mins?)\b(?:\s*(\d+)\s*(?:seconds?|sekunden|secs?|sek\b)?)?/i.exec(value);
    if (words) return Number(words[1]) * 60 + Number(words[2] || 0);
    return this.parseDurationString(value);
  }

  private static async lookupDuration(videoId: string): Promise<number> {
    try {
      const html = await this.fetchSearchDocument(`https://www.youtube.com/watch?v=${videoId}`);
      const millis = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/)?.[1];
      if (millis) return Math.round(parseInt(millis, 10) / 1000);
      const seconds = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/)?.[1];
      if (seconds) return parseInt(seconds, 10);
    } catch (error) { this.noteError(error); }
    return 0;
  }

  private static async innertubeMusicSearch(query: string, html: string): Promise<AnyObject | null> {
    const key = html.match(/"INNERTUBE_API_KEY":"([a-zA-Z0-9_-]+)"/)?.[1];
    if (!key) return null;
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '1.20241016.01.00';
    try {
      const res = await fetch(`https://music.youtube.com/youtubei/v1/search?key=${encodeURIComponent(key)}&prettyPrint=false`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Origin': 'https://music.youtube.com',
          'Referer': 'https://music.youtube.com/',
          'Cookie': 'SOCS=CAE'
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion, hl: 'en', gl: 'US' } },
          query
        })
      });
      if (!res.ok) return null;
      return await res.json() as AnyObject;
    } catch (error) {
      this.noteError(error);
      return null;
    }
  }

  private static async fetchSearchDocument(url: string, init?: RequestInit): Promise<string> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const headers = new Headers(init?.headers || {});
        headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        headers.set('Accept-Language', 'en-US,en;q=0.9,de-DE;q=0.8,de;q=0.7');
        headers.set('Cookie', 'SOCS=CAE');
        const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(8000) });
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          lastError = new ResolverError('NETWORK_ERROR', `Song-Suche antwortet mit HTTP ${res.status}.`);
          await new Promise(resolve => setTimeout(resolve, 400));
          continue;
        }
        if (!res.ok) throw new ResolverError('NETWORK_ERROR', `Song-Suche antwortet mit HTTP ${res.status}.`);
        return await res.text();
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 250));
          continue;
        }
      }
    }
    if (lastError instanceof ResolverError) throw lastError;
    throw new ResolverError('NETWORK_ERROR', 'Song-Suche ist derzeit nicht erreichbar. Bitte kurz danach erneut versuchen.');
  }

  /** Artist is normally the first navigable text run in YTM's song byline. */
  private static extractMusicArtist(runs: any[]): string {
    if (!Array.isArray(runs)) return '';
    for (const run of runs) {
      const text = typeof run?.text === 'string' ? run.text.trim() : '';
      if (!text || text === '•') continue;
      const pageType = run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';
      if (pageType.includes('ARTIST')) return text;
    }
    return runs.map((r: any) => typeof r?.text === 'string' ? r.text.trim() : '')
      .find((text: string) => text && text !== '•' && !/^\d{4}$/.test(text) && !/^\d+:\d{2}(?::\d{2})?$/.test(text)) || '';
  }

  private static textFromRuns(value: any): string {
    const runs = Array.isArray(value) ? value : value?.runs;
    if (!Array.isArray(runs)) return typeof value?.simpleText === 'string' ? value.simpleText : '';
    return runs.map((run: any) => typeof run?.text === 'string' ? run.text : '').join('');
  }

  /** Extract ytInitialData without depending on fragile greedy regular expressions. */
  private static extractInitialData(html: string): AnyObject | null {
    const markerIndex = html.indexOf('ytInitialData');
    if (markerIndex < 0) return null;
    const start = html.indexOf('{', markerIndex);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
        }
      }
    }
    return null;
  }

  /** Fallback: search normal YouTube only after YTM has no usable song result. scoringQuery keeps text search from accepting an unrelated first video. */
  private static async searchYouTubeVideo(query: string, scoringQuery?: string, hints?: TextMatchHints): Promise<ResolvedTrackInfo | null> {
    const phrase = scoringQuery || query;
    let html = '';
    try {
      html = await this.fetchSearchDocument(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    } catch (error) {
      this.noteError(error);
      throw new ResolverError('NETWORK_ERROR', 'YouTube-Suche fehlgeschlagen: Dienst derzeit nicht erreichbar. Bitte später erneut versuchen.');
    }

    const data = this.extractInitialData(html);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
    const candidates: ResolvedTrackInfo[] = [];
    if (Array.isArray(contents)) {
      for (const item of contents.slice(0, 12)) {
        const video = (item as AnyObject).videoRenderer as AnyObject | undefined;
        if (!video?.videoId) continue;
        const videoId = String(video.videoId);
        let title = video.title?.runs?.[0]?.text || 'Track';
        let artist = String(video.ownerText?.runs?.[0]?.text || 'Artist').replace(' - Topic', '');
        const duration = video.lengthText?.simpleText ? this.parseDurationString(video.lengthText.simpleText) : 0;
        if (!duration) continue;
        const thumbnailUrl = video.thumbnail?.thumbnails?.length ? video.thumbnail.thumbnails[video.thumbnail.thumbnails.length - 1].url : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          if (parts.length >= 2) { artist = parts[0].trim(); title = this.cleanTitle(parts.slice(1).join(' - ')); }
        }
        candidates.push({ channel: video.ownerText?.runs?.[0]?.text || '', videoId, title, artist, duration, thumbnailUrl, url: `https://music.youtube.com/watch?v=${videoId}` });
      }
    }
    const ranked = candidates
      .map(candidate => ({ candidate, judged: judgeTextMatch(phrase, candidate.title, candidate.artist, hints) }))
      .sort((a, b) => b.judged.score - a.judged.score);
    const chosen = scoringQuery ? ranked.find(item => item.judged.acceptable) : ranked[0];
    if (chosen) return chosen.candidate;
    if (scoringQuery) return null;

    // Link fallback when YouTube changed its structured search response.
    // A missing duration is a bad candidate, not a network outage.
    const videoIdMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)];
    for (const match of videoIdMatches.slice(0, 4)) {
      try { return await this.resolveByVideoId(match[1]); }
      catch (error) {
        this.noteError(error);
        if (error instanceof ResolverError) throw error;
      }
    }
    throw new ResolverError('NO_RESULTS', 'Kein abspielbarer Treffer mit bekannter Dauer gefunden. Bitte einen direkten YouTube-Link versuchen.');
  }


  private static getCached(key: string): ResolvedTrackInfo | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) { this.cache.delete(key); return null; }
    // Refresh insertion order so frequently used entries behave like a small LRU.
    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached.value;
  }

  private static trimCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key);
    while (this.cache.size > this.MAX_CACHE_ENTRIES) { const first=this.cache.keys().next().value; if(!first) break; this.cache.delete(first); }
  }

  private static trimNegativeCache() {
    const now = Date.now();
    for (const [key, entry] of this.negativeCache) if (entry.expiresAt <= now) this.negativeCache.delete(key);
    while (this.negativeCache.size > this.MAX_NEGATIVE_CACHE_ENTRIES) { const first=this.negativeCache.keys().next().value; if(!first) break; this.negativeCache.delete(first); }
  }
  private static loadPersistentCache() {
    if (this.persistentLoaded) return; this.persistentLoaded=true;
    try {
      if (!fs.existsSync(this.cacheFile())) return;
      const raw=JSON.parse(fs.readFileSync(this.cacheFile(),'utf8')) as Record<string,CacheEntry>;
      const now=Date.now();
      let loaded=0;
      for(const [key,entry] of Object.entries(raw)){
        if(entry?.expiresAt>now&&entry.value?.videoId){ this.cache.set(key,entry); loaded++; }
      }
      this.cachePreloaded=loaded;
      this.trimCache();
    } catch {}
  }
  private static persistCache() {
    try {
      this.trimCache();
      const payload=Object.fromEntries([...this.cache.entries()].slice(-this.MAX_CACHE_ENTRIES));
      // Search can run on the chat hot path; debounce disk I/O instead of blocking the
      // event loop after every successful request.
      scheduleJsonWrite(this.cacheFile(), payload, 500, { compact: true });
    } catch {}
  }

  private static noteError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.lastError = message.slice(0, 240);
  }

  private static normalizeSearchText(value: string): string {
    return value.toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(official|audio|video|lyrics?|music)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private static cleanTitle(title: string): string {
    return title
      .replace(/\(Official (?:Music )?Video.*?\)/ig, '')
      .replace(/\[Official (?:Music )?Video.*?\]/ig, '')
      .replace(/\(Official Audio.*?\)/ig, '')
      .replace(/\[Official Audio.*?\]/ig, '')
      .trim();
  }

  /** Convert duration string ("3:45" or "1:15:30") to seconds. */
  public static parseDurationString(str: string): number {
    const parts = str.trim().split(':').map(p => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }
}
