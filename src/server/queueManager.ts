import { QueuePersistence } from './queuePersistence.ts';
import type { BlacklistRule, BotConfig, PlaybackState, Requester, Track, VoteSkipState } from '../types.ts';
import type { ResolvedTrackInfo } from './youtubeResolver.ts';
import type { YtmCompanionClient } from './ytmCompanion.ts';
import type { SpotifyService, SpotifyPlaybackSnapshot } from './spotifyService.ts';
import { botEvents } from './eventBus.ts';
import { PlayerPluginRegistry, YouTubeMusicPlugin, SpotifyPlugin, type PlayerPlugin } from './playerPlugins/index.ts';

export interface AddSongResult {
  success: boolean;
  track?: Track;
  position?: number;
  error?: string;
}

export class QueueManager {
  private queue: Track[] = [];
  private recoveredTrack: Track | null = null;
  private history: Track[] = [];
  private currentTrack: Track | null = null;
  private blacklist: BlacklistRule[] = [];
  private voteSkip: VoteSkipState = {
    votes: [],
    requiredVotes: 3,
    currentTrackId: null
  };
  private playbackState: PlaybackState = {
    currentSong: null,
    isPlaying: false,
    progressSeconds: 0,
    durationSeconds: 0,
    volume: 80,
    source: 'idle'
  };

  private config: BotConfig;
  private ytmCompanion: YtmCompanionClient;
  public readonly spotifyService?: SpotifyService;
  public readonly playerRegistry: PlayerPluginRegistry;
  private persistence: QueuePersistence;
  private onStateChangeCb: (() => void) | null = null;
  private blockedRequesterSet = new Set<string>();
  private lastArchivedSpotifyUri: string | null = null;
  private text(de: string, en: string): string { return this.config.language === 'en' ? en : de; }

  constructor(config: BotConfig, ytmCompanion: YtmCompanionClient, spotifyService?: SpotifyService, playerRegistry?: PlayerPluginRegistry, persistence?: QueuePersistence) {
    this.config = config;
    this.ytmCompanion = ytmCompanion;
    this.spotifyService = spotifyService;
    if (playerRegistry) {
      this.playerRegistry = playerRegistry;
    } else {
      this.playerRegistry = new PlayerPluginRegistry([
        new YouTubeMusicPlugin(this.ytmCompanion),
        ...(this.spotifyService ? [new SpotifyPlugin(this.spotifyService)] : [])
      ]);
    }
    this.persistence = persistence || new QueuePersistence();
    const persisted = this.persistence.load();
    this.queue = persisted.queue;
    this.recoveredTrack = persisted.recoveredTrack;
    this.history = persisted.history;
    this.blacklist = persisted.blacklist;
    this.refreshBlockedRequesters();
    this.initCompanionSubscription();
    this.initSpotifySubscription();
  }


  private refreshBlockedRequesters() {
    this.blockedRequesterSet = new Set((this.config.blockedRequesters || []).map(name => name.trim().toLowerCase()).filter(Boolean));
  }

  public setOnStateChange(cb: () => void) {
    this.onStateChangeCb = cb;
  }

  private notify() {
    botEvents.emit('queue:changed',{reason:'state'});
    if (this.onStateChangeCb) {
      this.onStateChangeCb();
    }
  }

  public saveQueue() {
    try {
      this.persistence.saveQueue(this.queue, this.pendingTrack, this.currentTrack, this.recoveredTrack, this.history);
    } catch {
      this.playbackError = this.text('Daten konnten nicht gespeichert werden. Schreibrechte im data-Ordner prüfen.', 'Data could not be saved. Check write permissions for the data folder.');
    }
  }

  public saveBlacklist() {
    try {
      this.persistence.saveBlacklist(this.blacklist);
    } catch {
      this.playbackError = this.text('Daten konnten nicht gespeichert werden. Schreibrechte im data-Ordner prüfen.', 'Data could not be saved. Check write permissions for the data folder.');
    }
  }

  /**
   * String normalizer to match titles cleanly across YouTube search vs YTM Desktop metadata.
   * Handles German umlauts, eszett (ß) and accented characters so localized titles match reliably.
   */
  private normalizeString(str?: string): string {
    return (str || '')
      .toLowerCase()
      .replace(/[\(\[\{].*?[\)\]\}]/g, '') // strip brackets like (Official Video), [Audio], etc.
      .replace(/ft\..*|feat\..*/gi, '') // strip feat. artist in title
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Determine if incoming song info from YouTube Music Desktop matches a known Track
   */
  private isSameTrack(songInfo: { title?: string; author?: string; id?: string; requestedId?: string }, track: Track, allowRequestedSeed = false, incomingDuration = 0): boolean {
    if (!songInfo || !track) return false;
    const isValidYtId = (id?: string) => Boolean(id && /^[a-zA-Z0-9_-]{11}$/.test(id));
    // 1. Direct Video ID match if both sides have a valid YouTube ID
    if (isValidYtId(songInfo.id) && isValidYtId(track.videoId)) {
      if (isValidYtId(track.playbackId)) return songInfo.id === track.playbackId;
      if (songInfo.id === track.videoId) return true;
      // YouTube Music may replace a requested video with its catalogue item.
      // The radio seed remains in the URL for every later autoplay track, so
      // it is safe only while confirming the initial request.
      if (allowRequestedSeed && songInfo.requestedId === track.videoId) return true;
      // YouTube Music sometimes replaces a direct-link video with its catalog
      // recording and removes the requested id from the URL. Only accept that
      // during startup when title, artist and duration all agree.
      if (allowRequestedSeed && incomingDuration > 0 && track.duration > 0 &&
          Math.abs(incomingDuration - track.duration) <= 3 &&
          this.normalizeString(songInfo.title) === this.normalizeString(track.title) &&
          this.normalizeString(songInfo.author) === this.normalizeString(track.artist)) return true;
      return false;
    }
    // 2. Title matching (when videoId is missing or non-canonical from one side)
    const normInfo = this.normalizeString(songInfo.title);
    const normTrack = this.normalizeString(track.title);
    if (!normInfo || !normTrack) return false;

    // Direct title match or long substring inclusion
    const titleMatches = normInfo === normTrack ||
      (normInfo.length >= 6 && normTrack.length >= 6 && (normInfo.includes(normTrack) || normTrack.includes(normInfo)));
    if (!titleMatches) return false;

    const normAuthor = this.normalizeString(songInfo.author);
    const normArtist = this.normalizeString(track.artist);
    if (!normAuthor || !normArtist) return true;

    return normAuthor === normArtist ||
      normAuthor.includes(normArtist) ||
      normArtist.includes(normAuthor);
  }

  private transition: Promise<Track | null> | null = null;
  private pendingTrack: Track | null = null;
  private confirmStart: ((ok: boolean) => void) | null = null;
  private skipping = false;
  private playbackError = '';
  private providerGeneration = 0;
  private initCompanionSubscription() {
    this.ytmCompanion.subscribe(info => {
      if (this.config.playbackProvider === 'spotify') return;
      if (this.currentTrack?.playbackProvider === 'spotify' || this.pendingTrack?.playbackProvider === 'spotify') return;
      if (!this.currentTrack && !this.pendingTrack && this.playbackState.currentSong?.playbackProvider === 'spotify' && this.playbackState.source === 'external' && (this.playbackState.isPlaying || !info.isPlaying)) return;
      if (info.isConnected && /no_active_ytm_webContents|YouTube Music wird noch geladen/i.test(this.playbackError)) {
        this.playbackError = '';
      }
      if (Number.isFinite(info.volume)) this.playbackState.volume = info.volume!;
      if (!info.isConnected && !this.ytmCompanion.getIsSimulation()) {
        this.playbackState.isPlaying = false;
        this.notify(); return;
      }
      if (this.recoveredTrack && this.recoveredTrack.playbackProvider !== 'spotify') {
        const recovered = this.recoveredTrack; this.recoveredTrack = null;
        if (info.songInfo && this.isSameTrack(info.songInfo, recovered)) {
          this.currentTrack = recovered; this.voteSkip.currentTrackId = recovered.id;
        } else {
          if (!this.queue.some(t => t.id === recovered.id)) this.queue.unshift(recovered);
          this.playbackError = this.text('Request aus letzter Sitzung wiederhergestellt. Mit „Nächsten Request starten“ fortsetzen.', 'Request restored from the previous session. Continue with “Start next request”.');
          this.saveQueue();
          this.notify();
          return;
        }
        this.saveQueue();
      }
      if (this.pendingTrack) {
        // Confirm as soon as the companion loads the requested track
        const normalizedIncomingTitle = info.songInfo?.title?.trim().toLowerCase() || '';
        const isPlaceholder = normalizedIncomingTitle === 'laden...' || normalizedIncomingTitle === 'loading...';
        const hasAuthoritativeIdentity = !isPlaceholder && Boolean(
          info.songInfo?.id || (info.songInfo?.title && info.songInfo?.author && info.durationSeconds > 0)
        );
        if (!info.adPlaying && hasAuthoritativeIdentity && info.songInfo && this.isSameTrack(info.songInfo, this.pendingTrack, true, info.durationSeconds)) {
          if (info.songInfo.id) this.pendingTrack.playbackId = info.songInfo.id;
          if (!info.isPlaying) {
            void this.ytmCompanion.play().catch(() => {});
          }
          this.confirmStart?.(true);
        }
        this.notify(); return;
      }
      if (this.transition || info.adPlaying) return;
      const song = info.songInfo;
      // A stale window title without a video identity or timeline is not a
      // track transition and must not take ownership of Current Playback.
      if (song && !song.id && !song.author && info.durationSeconds <= 0 && info.progressSeconds <= 0) return;
      const songChanged = this.currentTrack && song && (song.id || song.title) && !this.isSameTrack(song, this.currentTrack);
      if (songChanged) {
        this.archiveCurrent();
        if (this.queue.length && !this.playbackError) { void this.playNext(); return; }
        if (!this.config.autoPlayRadio) void this.ytmCompanion.pause();
        // Immediately reset progress so the frontend doesn't show the old song's position
        // while waiting for the companion to report the new song's progress.
        this.playbackState.progressSeconds = 0;
      } else {
        this.playbackState.progressSeconds = info.progressSeconds;
      }
      this.playbackState.isPlaying = info.isPlaying;
      const effectiveDuration = (this.currentTrack && this.currentTrack.duration > 0)
        ? this.currentTrack.duration
        : (info.durationSeconds || (this.playbackState.currentSong?.duration || 0));
      this.playbackState.durationSeconds = effectiveDuration;
      if (song) {
        this.playbackError = '';
        const coverArt = song.cover || (song.id ? `https://img.youtube.com/vi/${song.id}/hqdefault.jpg` : '');
        if (this.currentTrack) {
          this.playbackState.source = 'queue';
          const trackDuration = this.currentTrack.duration > 0 ? this.currentTrack.duration : (info.durationSeconds || 0);
          this.playbackState.currentSong = {
            ...this.currentTrack,
            title: song.title || this.currentTrack.title,
            artist: song.author || this.currentTrack.artist,
            albumArtUrl: coverArt || this.currentTrack.albumArtUrl,
            duration: trackDuration
          };
          this.playbackState.durationSeconds = trackDuration;
        } else {
          this.playbackState.source = 'autoplay_radio';
          const existingSong = this.playbackState.currentSong;
          const sameSong = existingSong && ((song.id && existingSong.videoId === song.id) || (song.title && existingSong.title === song.title));
          if (!sameSong) {
            // Autoplay / Radio transitioned to a new song: immediately reset progress
            this.playbackState.progressSeconds = (info.progressSeconds > 0 && info.progressSeconds < 4) ? info.progressSeconds : 0;
          }
          let finalDuration = 0;
          if (sameSong && existingSong.duration > 0) {
            if (info.durationSeconds > 0 && Math.abs(info.durationSeconds - existingSong.duration) <= 2) {
              finalDuration = info.durationSeconds;
            } else {
              finalDuration = existingSong.duration;
            }
          } else {
            finalDuration = info.durationSeconds || 0;
          }
          this.playbackState.currentSong = {
            id: 'ytm-' + (song.id || song.title),
            videoId: song.id,
            title: song.title,
            artist: song.author,
            albumArtUrl: coverArt,
            duration: finalDuration,
            url: song.id ? `https://music.youtube.com/watch?v=${song.id}` : '',
            requester: { username: 'radio', displayName: 'Autoplay Radio', badge: 'broadcaster' },
            requestedAt: sameSong ? existingSong.requestedAt : Date.now(),
            playbackProvider: 'youtube_music'
          };
          this.playbackState.durationSeconds = finalDuration;
        }
      } else if (!this.currentTrack) { this.playbackState.currentSong = null; this.playbackState.source = 'idle'; }
      // Only advance a confirmed request. Never use guessed metadata duration.
      const checkDuration = (this.currentTrack && this.currentTrack.duration > 0) ? this.currentTrack.duration : info.durationSeconds;
      if (this.currentTrack && checkDuration > 0 && (info.progressSeconds >= checkDuration - 0.5 || (info.durationSeconds > 0 && info.progressSeconds >= info.durationSeconds - 0.5))) {
        this.archiveCurrent();
        if (this.queue.length && !this.playbackError) void this.playNext();
        else if (!this.config.autoPlayRadio) void this.ytmCompanion.pause();
      }
      this.notify();
    });
  }
  private initSpotifySubscription() {
    this.spotifyService?.subscribe((info: SpotifyPlaybackSnapshot) => {
      if (this.config.playbackProvider !== 'spotify') return;
      if (this.skipping) return;
      if (!info.connected) return;
      if (this.recoveredTrack?.playbackProvider === 'spotify' && info.connected) {
        const recovered = this.recoveredTrack;
        this.recoveredTrack = null;
        const matches = Boolean(info.trackUri && recovered.spotifyUri && info.trackUri === recovered.spotifyUri);
        if (matches) {
          this.currentTrack = {
            ...recovered,
            title: info.title || recovered.title,
            artist: info.artist || recovered.artist,
            albumArtUrl: info.albumArtUrl || recovered.albumArtUrl,
            duration: info.durationSeconds || recovered.duration
          };
          this.voteSkip.currentTrackId = recovered.id;
          this.playbackState = {
            ...this.playbackState,
            currentSong: this.currentTrack,
            isPlaying: info.isPlaying,
            progressSeconds: info.progressSeconds,
            durationSeconds: info.durationSeconds || recovered.duration,
            volume: Number.isFinite(info.volume) ? info.volume : this.playbackState.volume,
            source: 'queue'
          };
        } else {
          if (!this.queue.some(track => track.id === recovered.id)) this.queue.unshift(recovered);
          this.playbackError = this.text('Spotify-Request aus der letzten Sitzung wiederhergestellt.', 'Spotify request restored from the previous session.');
        }
        this.saveQueue();
      }
      if (this.pendingTrack?.playbackProvider === 'spotify') {
        const matchesPending = !this.pendingTrack.spotifyUri || !info.trackUri || info.trackUri === this.pendingTrack.spotifyUri;
        const pendingSong = matchesPending ? {
          ...this.pendingTrack,
          title: info.title || this.pendingTrack.title,
          artist: info.artist || this.pendingTrack.artist,
          albumArtUrl: info.albumArtUrl || this.pendingTrack.albumArtUrl,
          duration: info.durationSeconds || this.pendingTrack.duration
        } : this.pendingTrack;
        // Keep the authoritative Spotify metadata on the queue object itself.
        // Otherwise a later state rebuild/persist can re-introduce the resolver
        // thumbnail and make the Control Center artwork appear to “jump back”.
        this.pendingTrack = pendingSong;
        this.playbackState = {
          ...this.playbackState,
          currentSong: pendingSong,
          isPlaying: info.isPlaying,
          progressSeconds: info.progressSeconds,
          durationSeconds: info.durationSeconds || this.pendingTrack.duration,
          volume: Number.isFinite(info.volume) ? info.volume : this.playbackState.volume,
          source: 'queue'
        };
        this.notify();
        return;
      }
      if (this.currentTrack?.playbackProvider !== 'spotify') {
        if (this.currentTrack || this.pendingTrack) return;
        if (this.playbackState.currentSong?.playbackProvider === 'youtube_music' && (this.playbackState.isPlaying || !info.isPlaying)) return;
        const previousSong = this.playbackState.currentSong;
        const wasExternalSpotify = this.playbackState.source === 'external' && previousSong?.playbackProvider === 'spotify';
        const changedTrack = wasExternalSpotify && previousSong.spotifyUri && info.trackUri && previousSong.spotifyUri !== info.trackUri;
        const previouslyNearEnd = this.playbackState.isPlaying && this.playbackState.durationSeconds > 0 &&
          this.playbackState.progressSeconds >= this.playbackState.durationSeconds - 5;
        const stoppedAtEnd = wasExternalSpotify && !info.isPlaying && previouslyNearEnd &&
          (!info.trackUri || (info.trackUri === previousSong.spotifyUri && info.progressSeconds === 0));
        const reachedEnd = wasExternalSpotify && info.isPlaying && info.durationSeconds > 0 &&
          info.progressSeconds >= info.durationSeconds - 0.5;
        // Playlist playback has no current request, but must hand over at a song boundary.
        if ((changedTrack || stoppedAtEnd || reachedEnd) && !this.transition && !this.playbackError &&
            this.queue.some(track => (track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music')) === 'spotify')) {
          void this.playNext();
          return;
        }
        if (!info.trackUri && !info.title) {
          if (this.playbackState.currentSong?.playbackProvider === 'spotify') {
            this.playbackState = {
              ...this.playbackState,
              currentSong: null,
              isPlaying: false,
              progressSeconds: 0,
              durationSeconds: 0,
              source: 'idle'
            };
            this.notify();
          }
          return;
        }
        // If Spotify is still reporting the track that just finished or was just skipped,
        // ignore this stale snapshot so it doesn't flash the old song as an external track.
        if (this.lastArchivedSpotifyUri) {
          if (info.trackUri && info.trackUri === this.lastArchivedSpotifyUri) {
            return;
          }
          // A new track with a different URI has arrived; clear the suppress filter.
          if (info.trackUri && info.trackUri !== this.lastArchivedSpotifyUri) {
            this.lastArchivedSpotifyUri = null;
          }
        }
        const existingSong = this.playbackState.currentSong;
        const spotifyId = info.trackId || info.trackUri || info.title || 'current';
        const sameSong = existingSong?.playbackProvider === 'spotify' &&
          (existingSong.spotifyUri === info.trackUri || existingSong.id === `spotify-live-${spotifyId}`);
        const externalTrack: Track = {
          id: `spotify-live-${spotifyId}`,
          title: info.title || existingSong?.title || this.text('Unbekannter Spotify-Titel', 'Unknown Spotify track'),
          artist: info.artist || existingSong?.artist || 'Spotify',
          albumArtUrl: info.albumArtUrl || existingSong?.albumArtUrl || '',
          duration: info.durationSeconds || (sameSong ? existingSong?.duration || 0 : 0),
          url: info.trackId ? `https://open.spotify.com/track/${info.trackId}` : '',
          spotifyUri: info.trackUri,
          requester: { username: 'spotify', displayName: 'Spotify Playback', badge: 'broadcaster' },
          requestedAt: sameSong ? existingSong!.requestedAt : Date.now(),
          playbackProvider: 'spotify'
        };
        this.playbackState = {
          ...this.playbackState,
          currentSong: externalTrack,
          isPlaying: info.isPlaying,
          progressSeconds: info.progressSeconds,
          durationSeconds: info.durationSeconds || externalTrack.duration,
          volume: Number.isFinite(info.volume) ? info.volume : this.playbackState.volume,
          source: 'external',
          status: info.isPlaying ? 'playing' : 'paused'
        };
        if (!this.queue.some(track => (track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music')) === 'spotify')) {
          this.playbackError = '';
        }
        this.notify();
        return;
      }
      const expectedUri = this.currentTrack.spotifyUri;
      // Spotify may keep the finished item and reset progress to zero. Inspect
      // the preceding sample before replacing it with the stopped snapshot.
      const previouslyNearEnd = this.playbackState.isPlaying && this.playbackState.durationSeconds > 0 &&
        this.playbackState.progressSeconds >= this.playbackState.durationSeconds - 5;
      const stoppedAtEnd = !info.isPlaying && previouslyNearEnd &&
        (!info.trackUri || (info.trackUri === expectedUri && info.progressSeconds === 0));
      const stoppedNoTrack = !info.isPlaying && !info.trackUri && this.playbackState.isPlaying;
      if (stoppedAtEnd || stoppedNoTrack) {
        this.archiveCurrent();
        void this.continueSpotifyAfterRequest();
        return;
      }
      if (expectedUri && info.trackUri && info.trackUri !== expectedUri) {
        this.archiveCurrent();
        void this.continueSpotifyAfterRequest();
        return;
      }
      const authoritativeTrack = {
        ...this.currentTrack,
        title: info.title || this.currentTrack.title,
        artist: info.artist || this.currentTrack.artist,
        albumArtUrl: info.albumArtUrl || this.currentTrack.albumArtUrl,
        duration: info.durationSeconds || this.currentTrack.duration
      };
      // Persist Spotify's authoritative metadata as the actual current track, not
      // only as a transient playback copy. This prevents stale covers from being
      // restored by later queue notifications or persistence writes.
      this.currentTrack = authoritativeTrack;
      this.playbackState = {
        ...this.playbackState,
        currentSong: authoritativeTrack,
        isPlaying: info.isPlaying,
        progressSeconds: info.progressSeconds,
        durationSeconds: info.durationSeconds || this.currentTrack.duration,
        volume: Number.isFinite(info.volume) ? info.volume : this.playbackState.volume,
        source: 'queue',
        status: info.isPlaying ? 'playing' : 'paused'
      };
      if (info.durationSeconds > 0 && info.progressSeconds >= info.durationSeconds - 0.5) {
        this.archiveCurrent();
        void this.continueSpotifyAfterRequest();
        this.notify();
        return;
      }
      this.notify();
    });
  }

  private spotifyContinuationPending = false;
  private async continueSpotifyAfterRequest() {
    if (this.spotifyContinuationPending || this.config.playbackProvider !== 'spotify') return;
    if (this.queue.some(track => (track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music')) === 'spotify')) {
      if (!this.playbackError) await this.playNext();
      return;
    }
    const playlist = this.config.spotifyFallbackPlaylist;
    if (!playlist || !this.spotifyService || this.pendingTrack || this.currentTrack) return;
    this.spotifyContinuationPending = true;
    try {
      const accepted = await this.spotifyService.playPlaylist(playlist);
      if (this.config.playbackProvider !== 'spotify' || this.currentTrack || this.pendingTrack) return;
      if (!accepted) throw new Error(this.text('Playlist-Start wurde abgelehnt.', 'Playlist start was rejected.'));
      this.playbackError = '';
      const existingExternal = this.playbackState.source === 'external' ? this.playbackState.currentSong : null;
      this.playbackState = {
        ...this.playbackState,
        currentSong: existingExternal,
        isPlaying: existingExternal ? this.playbackState.isPlaying : true,
        progressSeconds: existingExternal ? this.playbackState.progressSeconds : 0,
        durationSeconds: existingExternal ? this.playbackState.durationSeconds : 0,
        source: 'external',
        status: existingExternal ? (this.playbackState.isPlaying ? 'playing' : 'paused') : 'loading'
      };
    } catch (error) {
      if (this.config.playbackProvider !== 'spotify' || this.currentTrack || this.pendingTrack) return;
      this.playbackError = this.text('Spotify-Anschlussplaylist: ', 'Spotify fallback playlist: ') + (error instanceof Error ? error.message : String(error));
    } finally {
      this.spotifyContinuationPending = false;
      this.notify();
    }
  }

  private archiveCurrent() {
    if (this.currentTrack) {
      if (this.currentTrack.spotifyUri) {
        this.lastArchivedSpotifyUri = this.currentTrack.spotifyUri;
      }
      this.history.unshift(this.currentTrack);
      this.history = this.history.slice(0, 100);
    }
    this.currentTrack = null;
    this.voteSkip.votes = [];
    this.voteSkip.currentTrackId = null;
    if (this.playbackState.source === 'queue') {
      this.playbackState = {
        ...this.playbackState,
        currentSong: null,
        progressSeconds: 0,
        status: 'loading'
      };
    }
    this.saveQueue();
  }

  /**
   * Validate and add a song to the FIFO queue
   */
  public addSong(resolved: ResolvedTrackInfo, requester?: Requester): AddSongResult {
    if (this.config.playbackProvider === 'spotify' && !resolved.spotifyUri) return { success: false, error: this.text('Für den gewählten Spotify-Player fehlt ein Spotify-Titel.', 'The selected Spotify player requires a Spotify track.') };
    if (!Number.isFinite(resolved.duration) || resolved.duration <= 0) return { success: false, error: this.text('Songdauer konnte nicht zuverlässig ermittelt werden.', 'Song duration could not be determined reliably.') };
    const effectiveRequester: Requester = requester || (resolved as any).requester || { username: 'anonymous', displayName: 'Anonymous', badge: 'viewer' };
    const requesterName = (effectiveRequester.username || '').toLowerCase();
    const isPrivileged = effectiveRequester.badge === 'broadcaster' || effectiveRequester.badge === 'moderator';
    if (this.blockedRequesterSet.has(requesterName) && !isPrivileged) return { success:false, error:this.text('Du bist vorübergehend für Songrequests gesperrt.', 'You are temporarily blocked from requesting songs.') };
    const maxQueue=this.config.maxQueueSize || 100;
    if (this.queue.length >= maxQueue) return { success: false, error: this.text(`Warteschlange voll (${maxQueue} Songs).`, `Queue is full (${maxQueue} songs).`) };
    const minDuration=this.config.minSongDurationSeconds || 0;
    if (resolved.duration < minDuration) return { success:false, error:this.text(`Song ist kürzer als die Mindestlänge (${minDuration}s).`, `Song is shorter than the minimum duration (${minDuration}s).`) };
    const recentCount=this.config.preventRecentDuplicates || 0;
    if (recentCount > 0) {
      const recentLimit = Math.min(recentCount, this.history.length);
      for (let index = 0; index < recentLimit; index++) {
        if (this.history[index]?.videoId === resolved.videoId) return { success:false, error:this.text(`Dieser Song lief bereits in den letzten ${recentCount} Titeln.`, `This song was already played within the last ${recentCount} tracks.`) };
      }
    }
    const externalSpotifyUri = !this.currentTrack && this.playbackState.source === 'external'
      ? this.playbackState.currentSong?.spotifyUri
      : undefined;
    const sameExternalSpotify = Boolean(resolved.spotifyUri && externalSpotifyUri && resolved.spotifyUri === externalSpotifyUri);
    if (sameExternalSpotify || this.queue.some(track => track.videoId === resolved.videoId) || this.currentTrack?.videoId === resolved.videoId || this.pendingTrack?.videoId === resolved.videoId || this.recoveredTrack?.videoId === resolved.videoId) return { success: false, error: this.text('Dieser Song ist bereits aktiv oder in der Warteschlange.', 'This song is already playing or in the queue.') };
    // 1. Duration Limit Check (default 7 minutes / 420 seconds)
    const maxDuration = this.config.maxSongDurationSeconds || 420;
    if (resolved.duration > maxDuration) {
      const mins = Math.floor(maxDuration / 60);
      const isEn = this.config.language === 'en';
      return {
        success: false,
        error: isEn 
          ? `Song exceeds the maximum allowed duration (${mins} minutes). Detected: ${Math.floor(resolved.duration / 60)}m ${resolved.duration % 60}s.`
          : `Song überschreitet die maximale Länge (${mins} Minuten). Dauer: ${Math.floor(resolved.duration / 60)}m ${resolved.duration % 60}s.`
      };
    }

    // 2. Blacklist Check
    const artistText = resolved.artist.toLowerCase();
    const channelText = (resolved.channel || '').toLowerCase();
    const checkText = `${resolved.title} ${resolved.artist}`.toLowerCase();
    const isEn = this.config.language === 'en';
    for (const rule of this.blacklist) {
      if ((rule.type === 'artist' ? artistText : rule.type === 'channel' ? channelText : checkText).includes(rule.term)) {
        return {
          success: false,
          error: isEn 
            ? `Song contains blacklisted term ("${rule.term}").`
            : `Song enthält einen blockierten Begriff ("${rule.term}").`
        };
      }
    }

    // 3. User Quota Limit Check (broadcaster/moderator can bypass)
    if (!isPrivileged) {
      let activeCount = 0;
      for (const track of this.queue) if (track.requester.username.toLowerCase() === requesterName) activeCount++;
      if (this.currentTrack?.requester.username.toLowerCase() === requesterName) activeCount++;
      if (this.pendingTrack?.requester.username.toLowerCase() === requesterName) activeCount++;

      const maxPerUser = this.config.maxActivePerViewer || 2;
      if (activeCount >= maxPerUser) {
        return {
          success: false,
          error: isEn
            ? `You already have ${activeCount} songs in the queue (Max: ${maxPerUser}).`
            : `Du hast bereits ${activeCount} Songs in der Warteschlange (Max: ${maxPerUser}).`
        };
      }
    }

    // Build the Track item
    const track: Track = {
      id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: resolved.title,
      artist: resolved.artist,
      duration: resolved.duration,
      albumArtUrl: resolved.thumbnailUrl,
      url: resolved.url,
      videoId: resolved.videoId,
      requester: effectiveRequester,
      requestedAt: Date.now(),
      requestSource: resolved.requestSource,
      originalRequestUrl: resolved.originalRequestUrl,
      spotifyUri: resolved.spotifyUri,
      playbackProvider: resolved.spotifyUri && this.config.playbackProvider === 'spotify' ? 'spotify' : 'youtube_music'
    };

    this.queue.push(track);
    this.saveQueue();
    const position = this.queue.length;
    // An externally started song owns the selected player too. Keep new
    // requests queued until that playback is explicitly advanced or ends.
    if (!this.currentTrack && !this.pendingTrack && !this.transition && !this.playbackState.currentSong && !this.playbackError) void this.playNext();
    this.notify();
    return { success: true, track, position };
  }

  public playNext(): Promise<Track | null> {
    if (this.transition) return this.transition;
    // Assign the guard before any callbacks can synchronously re-enter.
    this.transition = Promise.resolve().then(() => this.startNext()).finally(() => { this.transition = null; this.notify(); });
    return this.transition;
  }
  private async startNext(): Promise<Track | null> {
    if (this.recoveredTrack) { this.queue.unshift(this.recoveredTrack); this.recoveredTrack = null; }
    if (!this.queue.length) return null;
    const selectedProvider = this.config.playbackProvider || 'youtube_music';
    const nextIndex = this.queue.findIndex(track => (track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music')) === selectedProvider);
    if (nextIndex < 0) return null;
    let next = this.queue.splice(nextIndex, 1)[0];
    const generation = this.providerGeneration;
    this.playbackError = '';

    const requestedProvider = next.playbackProvider || (next.spotifyUri && this.config.playbackProvider === 'spotify' ? 'spotify' : 'youtube_music');
    const spotifyRequested = requestedProvider === 'spotify';
    if (spotifyRequested && (!next.spotifyUri || !this.spotifyService)) {
      this.queue.splice(nextIndex, 0, next);
      this.playbackError = this.text('Spotify-Titel oder Spotify-Verbindung fehlt.', 'Spotify track or connection is missing.');
      this.saveQueue(); this.notify(); return null;
    }
    const spotifyReady = spotifyRequested && this.spotifyService!.isReadyForPlayback();
    if (spotifyRequested && !spotifyReady) {
      this.queue.unshift(next);
      this.playbackError = this.text('Spotify Premium ist nicht verbunden oder kein Spotify-Gerät ist verfügbar.', 'Spotify Premium is not connected or no Spotify device is available.');
      this.saveQueue(); this.notify(); return null;
    }

    next.playbackProvider = spotifyReady ? 'spotify' : 'youtube_music';
    this.pendingTrack = next;
    this.playbackState = {
      ...this.playbackState,
      currentSong: next,
      isPlaying: false,
      progressSeconds: 0,
      durationSeconds: next.duration,
      source: 'queue'
    };
    this.saveQueue(); this.notify();
    try {
      if (next.playbackProvider === 'spotify') {
        const spotifyPlugin = this.playerRegistry.get('spotify');
        // Prevent two playback engines from running at the same time.
        await this.ytmCompanion.pause().catch(() => false);
        if (generation !== this.providerGeneration) return null;

        let started = false;
        if (spotifyPlugin) {
          const result = await spotifyPlugin.playTrack(next);
          if (generation !== this.providerGeneration) { void spotifyPlugin.pause().catch(() => false); return null; }
          if (result.success) {
            started = true;
            if (result.track) next = result.track;
          } else {
            this.playbackError = result.error || this.text('Spotify-Songstart wurde nicht bestätigt.', 'Spotify track start was not confirmed.');
          }
        } else if (this.spotifyService) {
          const accepted = await this.spotifyService.playUri(next.spotifyUri!);
          if (generation !== this.providerGeneration) { void this.spotifyService.pause().catch(() => false); return null; }
          started = accepted && await this.spotifyService.waitForUri(next.spotifyUri!, 10_000);
          if (generation !== this.providerGeneration) { void this.spotifyService.pause().catch(() => false); return null; }
        }

        if (!started) {
            this.queue.unshift(next);
            if (!this.playbackError) {
              this.playbackError = this.spotifyService?.getLastError() || this.text('Spotify-Songstart wurde nicht bestätigt.', 'Spotify track start was not confirmed.');
            }
            if (this.currentTrack) {
              this.playbackState = { ...this.playbackState, currentSong: this.currentTrack, durationSeconds: this.currentTrack.duration, source: 'queue' };
            }
            return null;
        } else {
          this.archiveCurrent(); this.currentTrack = next;
          this.voteSkip.currentTrackId = next.id;
          const spotify = this.spotifyService?.getSnapshot();
          const spotifySong: Track = {
            ...next,
            title: spotify?.title || next.title,
            artist: spotify?.artist || next.artist,
            albumArtUrl: spotify?.albumArtUrl || next.albumArtUrl,
            duration: spotify?.durationSeconds || next.duration
          };
          this.currentTrack = spotifySong;
          this.playbackState = {
            ...this.playbackState,
            currentSong: spotifySong,
            isPlaying: Boolean(spotify?.isPlaying),
            progressSeconds: spotify?.progressSeconds || 0,
            durationSeconds: spotify?.durationSeconds || next.duration,
            volume: spotify?.volume ?? 80,
            source: 'queue'
          };
          return this.currentTrack;
        }
      }

      // YouTube Music (default / fallback)
      await this.spotifyService?.pause().catch(() => false);
      if (generation !== this.providerGeneration) return null;
      this.ytmCompanion.start?.();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = this.ytmCompanion.getStartConfirmationTimeout?.() ?? 20000;
      const confirmed = new Promise<boolean>(resolve => { this.confirmStart = resolve; timer = setTimeout(() => resolve(false), timeout); });

      const ytmPlugin = this.playerRegistry.get('youtube_music');
      const accepted = ytmPlugin
        ? (await ytmPlugin.playTrack(next, { autoplayRadio: this.config.autoPlayRadio })).success
        : await this.ytmCompanion.playTrack(next, this.config.autoPlayRadio);
      if (generation !== this.providerGeneration) { void this.ytmCompanion.pause().catch(() => false); return null; }
      if (!accepted) this.confirmStart?.(false);
      const started = await confirmed;
      if (generation !== this.providerGeneration) return null;
      if (timer) clearTimeout(timer);
      this.confirmStart = null;
      if (!accepted || !started) {
        this.queue.unshift(next);
        this.playbackError = this.ytmCompanion.getLastCommandError() || this.text(`Songstart nach ${timeout / 1000} Sekunden nicht bestätigt. Request bleibt erhalten; mit „Nächsten Request starten“ erneut versuchen.`, `Track start was not confirmed within ${timeout / 1000} seconds. The request remains in the queue; use “Start next request” to try again.`);
        if (this.currentTrack) {
          this.playbackState = { ...this.playbackState, currentSong: this.currentTrack, durationSeconds: this.currentTrack.duration, source: 'queue' };
        }
        return null;
      }
      this.archiveCurrent(); this.currentTrack = next;
      this.voteSkip.currentTrackId = next.id;
      this.playbackState = { ...this.playbackState, currentSong: next, isPlaying: true, progressSeconds: 0, durationSeconds: next.duration, source: 'queue' };
      return next;
    } catch (error) {
      if (generation !== this.providerGeneration) return null;
      this.queue.unshift(next);
      this.playbackError = error instanceof Error ? error.message : this.text('Wiedergabe fehlgeschlagen. Request bleibt erhalten.', 'Playback failed. The request remains in the queue.');
      if (this.currentTrack) {
        this.playbackState = { ...this.playbackState, currentSong: this.currentTrack, durationSeconds: this.currentTrack.duration, source: 'queue' };
      }
      return null;
    } finally {
      this.pendingTrack = null;
      this.confirmStart = null;
      if (!this.currentTrack) {
        this.playbackState = {
          ...this.playbackState,
          currentSong: null,
          isPlaying: false,
          progressSeconds: 0,
          durationSeconds: 0,
          source: 'idle'
        };
      }
      this.saveQueue();
      this.notify();
    }
  }

  public getActivePlugin(): PlayerPlugin {
    return this.playerRegistry.getActivePlugin(this.config.playbackProvider || 'youtube_music');
  }

  public async playPause(): Promise<boolean> {
    const plugin = this.getActivePlugin();
    return plugin.playPause(this.playbackState);
  }

  public async pause(): Promise<boolean> {
    const plugin = this.getActivePlugin();
    return plugin.pause();
  }

  public async play(): Promise<boolean> {
    const plugin = this.getActivePlugin();
    return plugin.play();
  }

  public async previousTrack(): Promise<boolean> {
    const plugin = this.getActivePlugin();
    if (this.playbackState.progressSeconds > 3) {
      if (plugin.previousTrack) return plugin.previousTrack();
      return false;
    }
    if (this.playbackState.source === 'queue' && this.history.length > 0) {
      const prevTrack = this.history.shift()!;
      if (this.currentTrack) {
        this.queue.unshift(this.currentTrack);
      }
      this.queue.unshift(prevTrack);
      const next = await this.playNext();
      return Boolean(next);
    }
    if (plugin.previousTrack) return plugin.previousTrack();
    return false;
  }

  public async setVolume(volume: number): Promise<boolean> {
    const safeVolume = Math.max(0, Math.min(100, Math.round(volume)));
    this.playbackState.volume = safeVolume;
    this.notify();
    const plugin = this.getActivePlugin();
    return plugin.setVolume(safeVolume);
  }

  public moveTrack(trackId: string, newIndex: number): boolean {
    const from=this.queue.findIndex(t=>t.id===trackId);
    if(from<0||!Number.isInteger(newIndex)) return false;
    const target=Math.max(0,Math.min(this.queue.length-1,newIndex));
    const [track]=this.queue.splice(from,1); this.queue.splice(target,0,track); this.saveQueue(); this.notify(); return true;
  }

  public removeRequester(username: string): number {
    const key = username.toLowerCase();
    const removed = this.queue.filter(track => track.requester.username.toLowerCase() === key);
    this.queue = this.queue.filter(track => track.requester.username.toLowerCase() !== key);
    if (removed.length) {
      this.saveQueue();
      for (const track of removed) botEvents.emit('queue:request_removed', { track });
      this.notify();
    }
    return removed.length;
  }

  public setRequesterBlocked(username: string, blocked: boolean): string[] {
    const key=username.trim().toLowerCase(); if(!key) return this.config.blockedRequesters || [];
    const set=new Set((this.config.blockedRequesters||[]).map(x=>x.toLowerCase())); blocked?set.add(key):set.delete(key); this.config.blockedRequesters=[...set]; this.notify(); return [...set];
  }

  /**
   * Moderator: skip current song
   */
  public async skipCurrent(_modUsername: string): Promise<{ success: boolean; nextTrack: Track | null }> {
    if (this.transition || this.skipping) return { success: false, nextTrack: null };
    if (this.queue.some(track => (track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music')) === (this.config.playbackProvider || 'youtube_music'))) {
      const nextTrack = await this.playNext();
      if (nextTrack) {
        return { success: true, nextTrack };
      }
      // A timeout or an unconfirmed start leaves the request queued so it can be retried.
      if (this.failedStartShouldStayQueued()) return { success: false, nextTrack: null };
      // A confirmed rejection cannot start. Drop that track and refund its redemption.
      const failedIndex = this.queue.findIndex(track => (track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music')) === (this.config.playbackProvider || 'youtube_music'));
      if (failedIndex >= 0) {
        const [removed] = this.queue.splice(failedIndex, 1);
        this.saveQueue();
        if (removed) botEvents.emit('queue:request_removed', { track: removed });
        if (this.queue.some(track => (track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music')) === (this.config.playbackProvider || 'youtube_music'))) {
          const subsequent = await this.playNext();
          if (subsequent) {
            return { success: true, nextTrack: subsequent };
          }
          if (this.failedStartShouldStayQueued()) return { success: false, nextTrack: null };
        }
      }
    }
    this.skipping = true;
    let success = false;
    try {
      if (this.config.playbackProvider === 'spotify' &&
          (this.currentTrack?.playbackProvider === 'spotify' || Boolean(this.currentTrack?.spotifyUri) || (!this.currentTrack && this.playbackState.source === 'queue')) &&
          this.config.spotifyFallbackPlaylist && this.spotifyService) {
        // An isolated request has no Spotify next item. Replace its context
        // directly with the fallback playlist instead of issuing Next first.
        const skippedTrack = this.currentTrack;
        try {
          success = await this.spotifyService.playPlaylist(this.config.spotifyFallbackPlaylist);
          if (this.currentTrack && this.currentTrack !== skippedTrack) return { success, nextTrack: null };
          if (this.config.playbackProvider !== 'spotify') return { success, nextTrack: null };
          if (!success) throw new Error(this.text('Playlist-Start wurde abgelehnt.', 'Playlist start was rejected.'));
          if (this.currentTrack === skippedTrack) {
            this.archiveCurrent();
          }
          this.playbackError = '';
          const existingExternal = this.playbackState.source === 'external' ? this.playbackState.currentSong : null;
          this.playbackState = {
            ...this.playbackState,
            currentSong: existingExternal,
            isPlaying: existingExternal ? this.playbackState.isPlaying : true,
            progressSeconds: existingExternal ? this.playbackState.progressSeconds : 0,
            durationSeconds: existingExternal ? this.playbackState.durationSeconds : 0,
            source: 'external',
            status: existingExternal ? (this.playbackState.isPlaying ? 'playing' : 'paused') : 'loading'
          };
        } catch (error) {
          success = false;
          this.playbackError = this.text('Spotify-Anschlussplaylist: ', 'Spotify fallback playlist: ') + (error instanceof Error ? error.message : String(error));
        }
        this.notify();
        return { success, nextTrack: null };
      }
      const plugin = this.getActivePlugin();
      if (plugin.skip) {
        success = await plugin.skip();
      }
    } finally {
      this.skipping = false;
    }
    if (success) {
      const wasExternal = !this.currentTrack && this.playbackState.source === 'external';
      this.archiveCurrent();
      this.playbackState.source = wasExternal ? 'external' : 'autoplay_radio';
      this.playbackState.progressSeconds = 0;
      this.playbackState.status = 'loading';
      this.playbackError = '';
      this.notify();
    }
    return { success, nextTrack: null };
  }

  /**
   * Moderator: veto / remove a specific track from the queue
   */
  public getRedemptionTracks(): Track[] {
    return [...this.queue, ...this.history, ...[this.pendingTrack, this.currentTrack, this.recoveredTrack].filter((track): track is Track => Boolean(track))];
  }

  public finishRedemption(id: string) {
    for (const track of this.getRedemptionTracks()) {
      if (track.id === id) { delete track.redemptionId; delete track.rewardId; }
    }
    this.saveQueue();
  }

  public persistRedemptionMetadata() { this.saveQueue(); }

  public withdrawLatestRequest(username: string, now = Date.now()): { track?: Track; reason?: 'missing' | 'expired' } {
    const candidates = this.queue.filter(track => track.requester.username.toLowerCase() === username.toLowerCase());
    const track = candidates.reduce<Track | undefined>((latest, item) => !latest || item.requestedAt >= latest.requestedAt ? item : latest, undefined);
    if (!track) return { reason: 'missing' };
    if (!Number.isFinite(track.requestedAt) || now < track.requestedAt || now - track.requestedAt > 60000) return { reason: 'expired' };
    const index = this.queue.indexOf(track);
    this.queue.splice(index, 1);
    try { this.persistence.saveQueue(this.queue, this.pendingTrack, this.currentTrack, this.recoveredTrack, this.history); }
    catch (error) { this.queue.splice(index, 0, track); throw error; }
    this.notify();
    return { track };
  }

  private failedStartShouldStayQueued(): boolean {
    return /bleibt erhalten|remains in the queue|wird noch geladen|still loading|within \d+ seconds|nach \d+ Sekunden/i.test(this.playbackError);
  }

  public vetoTrack(trackIdOrIndex: string | number): Track | null {
    let index = -1;
    if (typeof trackIdOrIndex === 'number') {
      index = trackIdOrIndex;
    } else {
      index = this.queue.findIndex(t => t.id === trackIdOrIndex);
    }

    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1)[0];
      this.saveQueue();
      botEvents.emit('queue:request_removed', { track: removed });
      this.notify();
      return removed;
    }
    return null;
  }

  /**
   * Moderator: clear entire queue
   */
  public clearQueue(): number {
    const removed = this.queue;
    const count = removed.length;
    this.queue = [];
    this.playbackError = '';
    this.saveQueue();
    for (const track of removed) botEvents.emit('queue:request_removed', { track });
    this.notify();
    return count;
  }

  /**
   * Viewer Vote-Skip
   */
  private voteTargetId(): string | null {
    if (this.currentTrack) return this.currentTrack.id;
    if (this.playbackState.source === 'autoplay_radio' || this.playbackState.source === 'external') {
      return this.playbackState.currentSong?.id || null;
    }
    return null;
  }

  private syncVoteTarget(): string | null {
    const targetId = this.voteTargetId();
    if (this.voteSkip.currentTrackId !== targetId) {
      this.voteSkip.votes = [];
      this.voteSkip.currentTrackId = targetId;
    }
    return targetId;
  }

  public async castVoteSkip(username: string, isPrivileged: boolean = false): Promise<{
    success: boolean;
    alreadyVoted: boolean;
    currentVotes: number;
    requiredVotes: number;
    didSkip: boolean;
  }> {
    if (!this.syncVoteTarget() || this.transition || this.skipping) {
      return {
        success: false,
        alreadyVoted: false,
        currentVotes: 0,
        requiredVotes: this.config.voteSkipThreshold || 3,
        didSkip: false
      };
    }

    const lower = username.toLowerCase();
    const requiredVotes = this.config.voteSkipThreshold || 3;

    // Privileged users (broadcaster / moderator) trigger an instant skip on !voteskip
    if (isPrivileged) {
      const result = await this.skipCurrent('vote');
      if (!result.success) { this.voteSkip.votes = []; this.notify(); }
      return {
        success: result.success,
        alreadyVoted: false,
        currentVotes: requiredVotes,
        requiredVotes,
        didSkip: result.success
      };
    }

    if (this.voteSkip.votes.includes(lower)) {
      return {
        success: true,
        alreadyVoted: true,
        currentVotes: this.voteSkip.votes.length,
        requiredVotes,
        didSkip: false
      };
    }

    this.voteSkip.votes.push(lower);
    const currentVotes = this.voteSkip.votes.length;

    if (currentVotes >= requiredVotes) {
      const result = await this.skipCurrent('vote');
      if (!result.success) { this.voteSkip.votes = []; this.notify(); }
      return {
        success: result.success,
        alreadyVoted: false,
        currentVotes,
        requiredVotes,
        didSkip: result.success
      };
    }

    this.notify();
    return {
      success: true,
      alreadyVoted: false,
      currentVotes,
      requiredVotes,
      didSkip: false
    };
  }

  /**
   * Blacklist management
   */
  public addBlacklistRule(term: string, addedBy: string, type: 'keyword' | 'artist' | 'channel' = 'keyword'): BlacklistRule {
    if (!term.trim()) throw new Error('Leerer Filter ist nicht erlaubt.');
    const rule: BlacklistRule = {
      id: `bl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      term: term.trim().toLowerCase(),
      type,
      addedBy,
      addedAt: Date.now()
    };

    this.blacklist.push(rule);
    this.saveBlacklist();
    this.notify();
    return rule;
  }

  public removeBlacklistRule(termOrId: string): boolean {
    const termLower = termOrId.trim().toLowerCase();
    const initialLen = this.blacklist.length;
    this.blacklist = this.blacklist.filter(r => r.id !== termOrId && r.term.toLowerCase() !== termLower);
    if (this.blacklist.length !== initialLen) {
      this.saveBlacklist();
      this.notify();
      return true;
    }
    return false;
  }

  public getBlacklist(): BlacklistRule[] {
    return [...this.blacklist];
  }

  public getQueue(): Track[] {
    return [...this.queue];
  }

  public getHistory(): Track[] { return [...this.history]; }

  public getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  public getPlaybackState(): PlaybackState {
    const currentSong = this.pendingTrack || this.playbackState.currentSong;
    const durationSeconds = this.pendingTrack?.duration || this.playbackState.durationSeconds;
    return {
      ...this.playbackState,
      currentSong,
      durationSeconds,
      status: this.pendingTrack ? 'loading' : this.playbackError ? 'error' : this.playbackState.isPlaying ? 'playing' : 'paused',
      error: this.playbackError || undefined
    };
  }

  public getVoteSkipState(): VoteSkipState {
    this.syncVoteTarget();
    return {
      votes: [...this.voteSkip.votes],
      requiredVotes: this.config.voteSkipThreshold || 3,
      currentTrackId: this.voteSkip.currentTrackId
    };
  }

  public updateConfig(newConfig: Partial<BotConfig>) {
    const previousProvider = this.config.playbackProvider || 'youtube_music';
    const nextProvider = newConfig.playbackProvider || previousProvider;
    const outgoingPlugin = previousProvider !== nextProvider ? this.getActivePlugin() : null;
    this.config = { ...this.config, ...newConfig };
    this.refreshBlockedRequesters();
    this.voteSkip.requiredVotes = this.config.voteSkipThreshold || 3;

    if (outgoingPlugin) {
      this.providerGeneration++;
      this.confirmStart?.(false);
      if (this.pendingTrack && !this.queue.some(track => track.id === this.pendingTrack!.id)) this.queue.unshift(this.pendingTrack);
      this.pendingTrack = null;
      // Changing providers is a playback handover. Pause the player that owns
      // the current song before clearing it, so controls target the new player.
      void outgoingPlugin.pause().catch(() => false);
      this.archiveCurrent();
      this.playbackError = '';
      this.playbackState = {
        ...this.playbackState,
        currentSong: null,
        isPlaying: false,
        progressSeconds: 0,
        durationSeconds: 0,
        source: 'idle'
      };
      this.saveQueue();
    }
    this.notify();
  }

  public clearPlaybackError(): void {
    if (this.playbackError) {
      this.playbackError = '';
      this.notify();
    }
  }
}
