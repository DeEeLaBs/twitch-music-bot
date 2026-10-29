import type { BotConfig } from '../types.ts';
import type { SpotifyService } from './spotifyService.ts';
import { ResolverError, YouTubeResolver, type ResolvedTrackInfo } from './youtubeResolver.ts';

export async function resolveForPlaybackProvider(
  query: string,
  config: Pick<BotConfig, 'playbackProvider' | 'spotifyFallbackToYtm'>,
  spotifyService?: Pick<SpotifyService, 'isReadyForPlayback' | 'searchTrack'>
): Promise<ResolvedTrackInfo> {
  const youtubeRequest = Boolean(YouTubeResolver.extractVideoId(query));
  if (config.playbackProvider !== 'spotify') {
    // The YouTube resolver reads Spotify track metadata and finds a matching
    // YouTube Music video. The Spotify URI is only source metadata here.
    const resolved = await YouTubeResolver.resolve(query);
    return { ...resolved, spotifyUri: undefined };
  }
  if (youtubeRequest) throw new ResolverError('NO_RESULTS', 'YouTube-Links können nur mit YouTube Music als Player angefragt werden.');
  if (spotifyService?.isReadyForPlayback()) {
    try {
      return await spotifyService.searchTrack(query) as ResolvedTrackInfo;
    } catch (error) {
      throw new ResolverError('NO_RESULTS', error instanceof Error ? error.message : 'Spotify Suche fehlgeschlagen');
    }
  }
  throw new ResolverError('NO_RESULTS', 'Spotify Premium ist nicht bereit. Bitte Spotify verbinden, bevor Songs gesucht werden.');
}
