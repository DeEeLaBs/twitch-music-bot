import type { BotConfig } from '../types.ts';
import type { SpotifyService } from './spotifyService.ts';
import { ResolverError, YouTubeResolver, type ResolvedTrackInfo } from './youtubeResolver.ts';

export async function resolveForPlaybackProvider(
  query: string,
  config: Pick<BotConfig, 'playbackProvider' | 'spotifyFallbackToYtm'>,
  spotifyService?: Pick<SpotifyService, 'isReadyForPlayback' | 'searchTrack' | 'matchTrack'>
): Promise<ResolvedTrackInfo> {
  const input=query.trim();
  const videoId=YouTubeResolver.extractVideoId(input);
  const spotifyId=YouTubeResolver.extractSpotifyTrackId(input);
  if (!videoId && !spotifyId && (/^[a-z][\w+.-]*:\/\//i.test(input)||/^(spotify|https?|javascript|data|file):/i.test(input))) {
    throw new ResolverError('INVALID_VIDEO','Ungültiger oder nicht unterstützter Song-Link. Bitte einen einzelnen Spotify-, YouTube- oder YouTube-Music-Song verlinken.');
  }
  if (config.playbackProvider !== 'spotify') {
    try {
      const resolved=await YouTubeResolver.resolve(input);
      return {...resolved,sourceSpotifyUri:resolved.spotifyUri,spotifyUri:undefined};
    } catch(error) {
      if(error instanceof ResolverError)throw error;
      throw new ResolverError('NO_RESULTS',error instanceof Error?error.message:'YouTube-Suche fehlgeschlagen.');
    }
  }
  if (!spotifyService?.isReadyForPlayback()) throw new ResolverError('NO_RESULTS','Spotify Premium ist nicht bereit. Bitte Spotify verbinden, bevor Songs gesucht werden.');
  try {
    if (videoId) {
      const source=await YouTubeResolver.resolve(input);
      const matched=await spotifyService.matchTrack(source);
      return {...matched,requestSource:'youtube',originalRequestUrl:input,sourceVideoId:videoId,sourceTitle:source.title,sourceArtist:source.artist,sourceChannel:source.channel};
    }
    const result=await spotifyService.searchTrack(spotifyId?`spotify:track:${spotifyId}`:input) as ResolvedTrackInfo;
    return {...result,...(spotifyId?{requestSource:'spotify' as const,originalRequestUrl:input}:{})};
  } catch(error) {
    if(error instanceof ResolverError)throw error;
    throw new ResolverError('NO_RESULTS',error instanceof Error?error.message:'Spotify-Suche fehlgeschlagen.');
  }
}
