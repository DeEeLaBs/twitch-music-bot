import type { Track } from './types.ts';

export function playbackIdentity(track: Track | null | undefined): string {
  if (!track) return '';
  const item = track.playbackId || track.spotifyUri || track.videoId;
  const metadata = [track.title, track.artist].map(value => (value || '').trim().toLowerCase());
  return JSON.stringify([track.playbackProvider || 'youtube_music', item || metadata, item ? '' : track.id]);
}
