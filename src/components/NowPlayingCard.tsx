import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, ThumbsUp, Radio, AlertCircle, Volume2 } from 'lucide-react';
import type { PlaybackState, VoteSkipState } from '../types.ts';
import { useTranslations } from '../translations.ts';
import { artworkUrl } from '../artworkUrl.ts';
import { playbackIdentity } from '../playbackIdentity.ts';

interface NowPlayingCardProps {
  language?: 'de' | 'en';
  playback: PlaybackState;
  voteSkip: VoteSkipState;
  onPlayPause: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onVolumeChange: (volume: number) => void | Promise<void>;
  onVoteSkip: (user: string) => void;
}

const NowPlayingCardComponent: React.FC<NowPlayingCardProps> = ({
  language = 'de',
  playback,
  voteSkip,
  onPlayPause,
  onSkip,
  onPrevious,
  onVolumeChange,
  onVoteSkip
}) => {
  const t = useTranslations(language);
  const song = playback.currentSong;
  const isPlaying = playback.isPlaying;
  const isSpotify = song?.playbackProvider === 'spotify';
  const durationSec = Math.max(0, playback.durationSeconds || song?.duration || 0);
  const fallbackCover = song?.videoId ? `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg` : '';
  const rawCoverUrl = song?.albumArtUrl?.trim() || fallbackCover;
  const coverUrl = artworkUrl(rawCoverUrl);

  const songKey = playbackIdentity(song);
  const lastSongKeyRef = useRef(songKey);
  const songChangedAtRef = useRef(0);
  const [smoothProgress, setSmoothProgress] = useState(playback.progressSeconds);
  const [localVolume, setLocalVolume] = useState(playback.volume);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVolumeRef = useRef<number | null>(null);
  const volumeRequestRef = useRef(false);
  const volumeProtectedRef = useRef(false);
  const mountedRef = useRef(true);
  const reportedVolumeRef = useRef(playback.volume);
  const sendVolumeRef = useRef(onVolumeChange);
  reportedVolumeRef.current = playback.volume;
  sendVolumeRef.current = onVolumeChange;

  useEffect(() => {
    if (!volumeProtectedRef.current) setLocalVolume(playback.volume);
  }, [playback.volume]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
      if (volumeSyncTimerRef.current !== null) clearTimeout(volumeSyncTimerRef.current);
      pendingVolumeRef.current = null;
    };
  }, []);

  const flushVolume = async () => {
    if (!mountedRef.current || volumeRequestRef.current || pendingVolumeRef.current === null) return;
    const volume = pendingVolumeRef.current;
    pendingVolumeRef.current = null;
    volumeRequestRef.current = true;
    try {
      await sendVolumeRef.current(volume);
    } catch {
      // Reconcile with the player after a failed request too.
    } finally {
      volumeRequestRef.current = false;
      if (mountedRef.current) {
        if (pendingVolumeRef.current !== null) {
          if (volumeTimerRef.current === null) void flushVolume();
        } else {
          // Player polling can still contain the value preceding this command.
          volumeSyncTimerRef.current = setTimeout(() => {
            volumeSyncTimerRef.current = null;
            volumeProtectedRef.current = false;
            setLocalVolume(reportedVolumeRef.current);
          }, 1500);
        }
      }
    }
  };

  const changeVolume = (volume: number) => {
    setLocalVolume(volume);
    volumeProtectedRef.current = true;
    pendingVolumeRef.current = volume;
    if (volumeSyncTimerRef.current !== null) {
      clearTimeout(volumeSyncTimerRef.current);
      volumeSyncTimerRef.current = null;
    }
    if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(() => {
      volumeTimerRef.current = null;
      void flushVolume();
    }, 150);
  };

  // Synchronize smooth progress with authoritative server updates
  useEffect(() => {
    // Spotify sends track identity and position in the same confirmed snapshot.
    // Its new-track position must not be discarded by the YouTube transition guard.
    if (isSpotify || !isPlaying) {
      lastSongKeyRef.current = songKey;
      setSmoothProgress(playback.progressSeconds);
      return;
    }
    if (songKey !== lastSongKeyRef.current) {
      lastSongKeyRef.current = songKey;
      songChangedAtRef.current = Date.now();
      setSmoothProgress((playback.progressSeconds && playback.progressSeconds < 5) ? playback.progressSeconds : 0);
      return;
    }
    setSmoothProgress((prev) => {
      // Guard against stale progress from the previous track arriving right after a track change
      if (Date.now() - songChangedAtRef.current < 4000 && playback.progressSeconds > 5) {
        return prev;
      }
      const diff = playback.progressSeconds - prev;
      if (Math.abs(diff) > 3 || playback.progressSeconds === 0) {
        return playback.progressSeconds;
      }
      if (diff > 0) {
        return playback.progressSeconds;
      }
      return prev;
    });
  }, [playback.progressSeconds, songKey, isPlaying, isSpotify]);

  // Interpolate between server samples using elapsed time, including delayed ticks.
  useEffect(() => {
    if (!isPlaying) return;
    let lastTick = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, (now - lastTick) / 1000);
      lastTick = now;
      setSmoothProgress((prev) => durationSec > 0 ? Math.min(durationSec, prev + elapsed) : prev);
    }, 250);
    return () => clearInterval(timer);
  }, [isPlaying, durationSec, songKey, playback.progressSeconds]);

  const clampedProgress = durationSec > 0 ? Math.min(durationSec, smoothProgress) : smoothProgress;
  const displayProgress = clampedProgress;
  const progressPct = durationSec > 0 ? Math.min(100, Math.max(0, (displayProgress / durationSec) * 100)) : 0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isRadio = song?.requester?.username === 'YouTube Music Radio' || song?.requester?.displayName === 'Autoplay Radio';
  const isExternal = playback.source === 'external';

  return (
    <div
      id="now-playing-card"
      className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl relative overflow-hidden"
    >
      {/* Ambient Glow Background */}
      <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full bg-purple-600/20 blur-3xl pointer-events-none animate-glow" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {language === 'de' ? 'Aktuelle Wiedergabe' : 'Current Playback'}
          </span>
        </div>

        {isRadio ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            {t('playbackRadio')}
          </span>
        ) : isExternal && song ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            {playback.status === 'loading' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-0.5" />}
            {playback.status === 'loading'
              ? (language === 'de' ? 'Nächster Titel…' : 'Skipping…')
              : (language === 'de' ? 'Direkte Wiedergabe' : 'Direct playback')}
          </span>
        ) : song ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
            {playback.status === 'loading' && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping mr-0.5" />}
            {playback.status === 'loading'
              ? (language === 'de' ? 'Wird gestartet…' : 'Starting…')
              : (language === 'de' ? `Wunsch von @${song.requester.displayName}` : `Requested by @${song.requester.displayName}`)}
          </span>
        ) : (
          <span className="text-xs text-neutral-500">{t('playbackIdle')}</span>
        )}
      </div>

      {song ? (
        <>
          <div className="flex gap-4 items-center">
            {/* Album Cover Art */}
            <div className="relative w-28 h-28 rounded-xl overflow-hidden shadow-2xl shrink-0 bg-neutral-950 border border-neutral-700/60 group">
              {coverUrl ? (
                <img
                  key={coverUrl}
                  src={coverUrl}
                  alt={song.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const image = e.currentTarget as HTMLImageElement;
                    image.style.display = 'none';
                    const placeholder = image.nextElementSibling as HTMLElement | null;
                    if (placeholder) placeholder.style.display = 'grid';
                  }}
                />
              ) : null}
              <div
                className="absolute inset-0 place-items-center text-neutral-500 bg-neutral-950"
                style={{ display: coverUrl ? 'none' : 'grid' }}
                aria-hidden="true"
              >
                <Radio className="w-8 h-8" />
              </div>
              {isPlaying ? (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-mono text-emerald-400 border border-emerald-500/30">
                  {t('playbackPlaying')}
                </div>
              ) : playback.status === 'loading' ? (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-purple-950/80 backdrop-blur-sm text-[9px] font-mono text-purple-300 border border-purple-500/40 animate-pulse">
                  {language === 'de' ? 'WIRD GESTARTET…' : 'STARTING…'}
                </div>
              ) : null}
            </div>

            {/* Song Info */}
            <div className="flex-1 min-w-0">
              <div>
                <h2 className="text-base font-bold text-white truncate" title={song.title}>
                  {song.title}
                </h2>
                <p className="text-xs font-medium text-neutral-400 truncate mt-0.5">
                  {song.artist}
                </p>
              </div>
              <div className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {song.playbackProvider === 'spotify' ? 'Spotify' : 'YouTube Music'}
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden" role="progressbar" aria-label={t('ovProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)}>
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-[width] duration-200 ease-linear"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-neutral-400 mt-1">
                  <span>{formatTime(displayProgress)}</span>
                  <span>{formatTime(durationSec)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mt-5 pt-3 border-t border-neutral-800 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                id="btn-prev-track"
                type="button"
                onClick={onPrevious}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                title={t('previousSong')}
                aria-label={t('previousSong')}
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                id="btn-play-pause"
                type="button"
                onClick={onPlayPause}
                className="px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-purple-900/30"
                aria-label={isPlaying ? t('pausePlayback') : t('resumePlayback')}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : t('playbackPlay')}</span>
              </button>
              <button
                id="btn-skip-track"
                type="button"
                onClick={onSkip}
                disabled={playback.status === 'loading'}
                className={`px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors ${playback.status === 'loading' ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={t('npModSkip') || "Mod Skip (!skip)"}
              >
                <SkipForward className={`w-3.5 h-3.5 ${playback.status === 'loading' ? 'animate-pulse' : ''}`} />
                <span>{playback.status === 'loading' ? (language === 'de' ? 'Skippe…' : 'Skipping…') : t('playbackSkip')}</span>
              </button>
            </div>

            <label className="flex items-center gap-2 min-w-[130px]" title={`${Math.round(localVolume)}%`}>
              <Volume2 className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                type="range"
                min="0"
                max="100"
                value={localVolume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                className="w-full accent-purple-500"
                aria-label={language === 'de' ? 'Lautstärke' : 'Volume'}
              />
              <span className="text-[10px] text-neutral-400 tabular-nums w-7 text-right">{Math.round(localVolume)}%</span>
            </label>

            {/* Vote-Skip Widget */}
            {!isExternal && <div className="flex items-center gap-2 bg-neutral-800/80 px-2.5 py-1.5 rounded-lg border border-neutral-700/60 text-xs">
              <ThumbsUp className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-neutral-300">
                {t('playbackVote')}: <strong className="text-white">{voteSkip.votes.length}</strong>/{voteSkip.requiredVotes}
              </span>
              <button
                id="btn-test-voteskip"
                type="button"
                onClick={() => {
                  const voter = `user_${Math.floor(Math.random() * 900 + 100)}`;
                  onVoteSkip(voter);
                }}
                className="text-[10px] bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/30 transition-colors"
                title={t('playbackVoteHint')}
              >
                {t('playbackVoteButton')}
              </button>
            </div>}
          </div>
        </>
      ) : (
        <div className="py-8 text-center text-neutral-400">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-neutral-500" />
          <p className="text-sm font-medium">{t('npEmptyTitle')}</p>
          <p className="text-xs text-neutral-500 mt-1">
            {t('npEmptyDesc')}
          </p>
        </div>
      )}
    </div>
  );
};

export const NowPlayingCard = React.memo(NowPlayingCardComponent);
