import React, { useEffect, useMemo, useRef, useState } from 'react';
import { playbackIdentity } from '../playbackIdentity.ts';
import {
  ExternalLink,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { apiFetch } from '../apiClient.ts';
import type { DockOptions } from '../dockOptions.ts';
import { DEFAULT_DOCK_OPTIONS } from '../dockOptions.ts';
import type { PlaybackState, Track } from '../types.ts';

type Props = {
  playback?: PlaybackState | null;
  queue?: Track[];
  language?: 'de' | 'en';
  interactive?: boolean;
  options?: Partial<DockOptions>;
  connectionLost?: boolean;
};

const formatTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const hexToRgb = (hex?: string) => {
  if (!hex || typeof hex !== 'string') return '255,255,255';
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 6 && normalized.length !== 3) return '255,255,255';
  const fullHex = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const value = Number.parseInt(fullHex, 16);
  if (Number.isNaN(value)) return '255,255,255';
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
};

export function ObsPlayerDock({ playback, queue = [], language = 'de', interactive = true, options, connectionLost = false }: Props) {
  const settings = { ...DEFAULT_DOCK_OPTIONS, ...options };
  const safeQueue = Array.isArray(queue) ? queue : [];
  const dockRef = useRef<HTMLElement | null>(null);
  const volumeTimerRef = useRef<number | null>(null);
  const volumeRequestRef = useRef(false);
  const pendingVolumeRef = useRef<number | null>(null);
  const lastSentVolumeRef = useRef<number | null>(null);
  const lastNonZeroVolumeRef = useRef<number>(playback?.volume && playback.volume > 0 ? playback.volume : 50);
  const lastUserVolumeInteractionRef = useRef<number>(0);
  const song = playback?.currentSong ?? null;
  const duration = Math.max(0, playback?.durationSeconds || song?.duration || 0);
  const [progress, setProgress] = useState(playback?.progressSeconds || 0);
  const songKey = playbackIdentity(song);
  const lastSongKeyRef = useRef(songKey);
  const songChangedAtRef = useRef(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [autoLayout, setAutoLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const [localVolume, setLocalVolume] = useState(playback?.volume ?? 0);

  useEffect(() => {
    if (songKey !== lastSongKeyRef.current) {
      lastSongKeyRef.current = songKey;
      songChangedAtRef.current = Date.now();
      setProgress((playback?.progressSeconds && playback.progressSeconds < 5) ? playback.progressSeconds : 0);
      return;
    }
    const next = playback?.progressSeconds || 0;
    setProgress((current) => {
      if (Date.now() - songChangedAtRef.current < 4000 && next > 5) {
        return current;
      }
      if (!song || Math.abs(next - current) > 2 || next === 0 || !playback?.isPlaying) return next;
      return Math.max(current, next);
    });
  }, [playback?.progressSeconds, songKey, song]);

  useEffect(() => {
    if (!playback?.isPlaying || !song) return;
    const timer = window.setInterval(() => {
      setProgress((current) => duration > 0 ? Math.min(duration, current + 1) : current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playback?.isPlaying, songKey, duration]);

  useEffect(() => {
    if (Date.now() - lastUserVolumeInteractionRef.current < 1500) return;
    if (!volumeRequestRef.current) {
      const vol = playback?.volume ?? 0;
      setLocalVolume(vol);
      if (vol > 0) lastNonZeroVolumeRef.current = vol;
    }
  }, [playback?.volume]);

  useEffect(() => {
    if (settings.layout !== 'auto' || !dockRef.current || typeof ResizeObserver === 'undefined') return;
    try {
      const node = dockRef.current;
      const update = () => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const shouldBeVertical = (rect.width < 520 && rect.height >= 140) || rect.height > Math.max(180, rect.width * 0.68);
        setAutoLayout(shouldBeVertical ? 'vertical' : 'horizontal');
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    } catch {
      return;
    }
  }, [settings.layout]);

  useEffect(() => () => {
    if (volumeTimerRef.current !== null) window.clearTimeout(volumeTimerRef.current);
  }, []);

  const resolvedLayout = settings.layout === 'auto' ? autoLayout : settings.layout;
  const clampedProgress = duration > 0 ? Math.min(progress, duration) : progress;
  const progressPct = useMemo(() => duration > 0 ? Math.min(100, Math.max(0, (clampedProgress / duration) * 100)) : 0, [clampedProgress, duration]);
  const visibleQueue = settings.showQueue ? safeQueue.slice(0, settings.queueItems) : [];
  const showTools = settings.showVolume || settings.showLinks;

  async function action(name: string, path: string, body?: unknown) {
    if (!interactive || (busy && name !== 'volume')) return false;
    if (name !== 'volume') setBusy(name);
    setLastError(null);
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || result?.message || 'Aktion fehlgeschlagen.');
      return true;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Aktion fehlgeschlagen.');
      return false;
    } finally {
      if (name !== 'volume') setBusy(null);
    }
  }

  async function flushVolume() {
    if (!interactive || volumeRequestRef.current) return;
    volumeRequestRef.current = true;
    try {
      while (pendingVolumeRef.current !== null) {
        const value = pendingVolumeRef.current;
        pendingVolumeRef.current = null;
        if (lastSentVolumeRef.current === value) continue;
        const ok = await action('volume', '/api/playback/volume', { volume: value });
        if (ok) lastSentVolumeRef.current = value;
        // Brief pacing between volume events
        if (pendingVolumeRef.current !== null) await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    } finally {
      volumeRequestRef.current = false;
    }
  }

  function scheduleVolume(value: number, immediate = false) {
    lastUserVolumeInteractionRef.current = Date.now();
    setLocalVolume(value);
    if (value > 0) lastNonZeroVolumeRef.current = value;
    if (!interactive) return;
    pendingVolumeRef.current = value;
    if (volumeTimerRef.current !== null) window.clearTimeout(volumeTimerRef.current);
    if (immediate) {
      volumeTimerRef.current = null;
      void flushVolume();
      return;
    }
    // Fast 150ms debounce so volume changes respond swiftly while dragging
    volumeTimerRef.current = window.setTimeout(() => {
      volumeTimerRef.current = null;
      void flushVolume();
    }, 150);
  }

  function toggleMute() {
    const next = localVolume > 0 ? 0 : (lastNonZeroVolumeRef.current || 50);
    scheduleVolume(next, true);
  }

  const VolumeIcon = localVolume <= 0 ? VolumeX : localVolume < 50 ? Volume1 : Volume2;
  const title = song?.title || (language === 'de' ? 'Kein Song läuft' : 'Nothing playing');
  const artist = song?.artist || (language === 'de' ? 'Warte auf YouTube Music …' : 'Waiting for YouTube Music …');
  const queueLabel = language === 'de' ? 'Warteschlange' : 'Queue';
  const style = {
    '--dock-accent': settings.accent,
    '--dock-accent-rgb': hexToRgb(settings.accent),
    '--dock-opacity': String(settings.opacity),
    '--dock-scale': String(settings.scale),
  } as React.CSSProperties;

  return (
    <section ref={dockRef} style={style} className={`obs-player-dock obs-player-dock--${resolvedLayout} obs-player-dock--${settings.density} ${settings.showQueue ? '' : 'obs-player-dock--no-queue'} ${showTools ? '' : 'obs-player-dock--no-tools'}`} aria-label={language === 'de' ? 'OBS Player Dock' : 'OBS player dock'}>
      <div className="obs-player-main">
        {settings.showProgress && <div className="obs-player-progress" aria-hidden="true"><span style={{ width: `${progressPct}%` }} /></div>}

        <div className="obs-player-song" title={`${title} — ${artist}`}>
          {settings.showCover && <div className="obs-player-cover">
            {song?.albumArtUrl ? <img src={song.albumArtUrl} alt="" /> : <div className="obs-player-cover-placeholder"><ListMusic /></div>}
          </div>}
          <div className="obs-player-copy">
            <strong>
              {title}
              {connectionLost && <span className="obs-dock-reconnecting" title={language === 'de' ? 'Verbindung wird wiederhergestellt …' : 'Reconnecting …'} aria-label={language === 'de' ? 'Wiederverbinden' : 'Reconnecting'}>●</span>}
            </strong>
            <span>{artist}</span>
          </div>
        </div>

        <div className="obs-player-transport">
          <button type="button" onClick={() => void action('previous', '/api/playback/previous')} disabled={!interactive || (!!busy && busy !== 'volume')} title={language === 'de' ? 'Vorheriger Song' : 'Previous song'} aria-label={language === 'de' ? 'Vorheriger Song' : 'Previous song'}>
            <SkipBack />
          </button>
          <button className="obs-player-primary" type="button" onClick={() => void action('play', '/api/playback/play-pause')} disabled={!interactive || (!!busy && busy !== 'volume')} title={playback?.isPlaying ? 'Pause' : 'Play'} aria-label={playback?.isPlaying ? 'Pause' : 'Play'}>
            {playback?.isPlaying ? <Pause /> : <Play />}
          </button>
          <button type="button" onClick={() => void action('next', '/api/playback/skip', { user: 'Streamer' })} disabled={!interactive || (!!busy && busy !== 'volume')} title={language === 'de' ? 'Nächster Song' : 'Next song'} aria-label={language === 'de' ? 'Nächster Song' : 'Next song'}>
            <SkipForward />
          </button>
          <span className="obs-player-time" aria-label={language === 'de' ? 'Wiedergabezeit' : 'Playback time'}>{formatTime(clampedProgress)} / {formatTime(duration)}</span>
        </div>

        {showTools && <div className="obs-player-tools">
          {settings.showVolume && <div className="obs-player-volume" title={language === 'de' ? `Lautstärke ${Math.round(localVolume)}%` : `Volume ${Math.round(localVolume)}%`}>
            <button type="button" className="obs-player-volume-button" onClick={toggleMute} disabled={!interactive} aria-label={language === 'de' ? 'Stumm / Laut' : 'Mute / unmute'}>
              <VolumeIcon />
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={localVolume}
              disabled={!interactive}
              onChange={(event) => scheduleVolume(Number(event.target.value))}
              onInput={(event) => scheduleVolume(Number(event.currentTarget.value))}
              onPointerUp={(event) => scheduleVolume(Number(event.currentTarget.value), true)}
              onMouseUp={(event) => scheduleVolume(Number(event.currentTarget.value), true)}
              onTouchEnd={(event) => scheduleVolume(Number(event.currentTarget.value), true)}
              onKeyUp={(event) => scheduleVolume(Number(event.currentTarget.value), true)}
              aria-label={language === 'de' ? 'Lautstärke' : 'Volume'}
            />
            <span className="obs-player-volume-value">{Math.round(localVolume)}%</span>
          </div>}
          {settings.showLinks && <>
            <a href="/" target="_blank" rel="noreferrer" title={language === 'de' ? 'Bot-Oberfläche öffnen' : 'Open bot dashboard'} aria-label={language === 'de' ? 'Bot-Oberfläche öffnen' : 'Open bot dashboard'}>
              <ListMusic />
            </a>
            <a href="/overlay" target="_blank" rel="noreferrer" title={language === 'de' ? 'Overlay öffnen' : 'Open overlay'} aria-label={language === 'de' ? 'Overlay öffnen' : 'Open overlay'}>
              <ExternalLink />
            </a>
          </>}
        </div>}
      </div>

      {settings.showQueue && <div className="obs-player-queue" aria-label={queueLabel}>
        <div className="obs-player-queue-head">
          <span><ListMusic /> {queueLabel}</span>
          <b>{safeQueue.length}</b>
        </div>
        <div className="obs-player-queue-list">
          {visibleQueue.length === 0 ? (
            <div className="obs-player-queue-empty">{language === 'de' ? 'Keine Songs in der Warteschlange' : 'No songs in queue'}</div>
          ) : visibleQueue.map((track, index) => (
            <div className="obs-player-queue-item" key={track.id} title={`${track.title} — ${track.artist}`}>
              <span className="obs-player-queue-index">{index + 1}</span>
              <div className="obs-player-queue-art">
                {track.albumArtUrl ? <img src={track.albumArtUrl} alt="" /> : <ListMusic />}
              </div>
              <div className="obs-player-queue-copy">
                <strong>{track.title}</strong>
                <span>{track.artist}{track.requestSource === 'spotify' ? ' · Spotify' : ''}{track.requester?.displayName ? ` · ${track.requester.displayName}` : ''}</span>
              </div>
              <time>{formatTime(track.duration)}</time>
            </div>
          ))}
        </div>
      </div>}

      {lastError && <div className="obs-player-error" role="status">{lastError}</div>}
    </section>
  );
}
