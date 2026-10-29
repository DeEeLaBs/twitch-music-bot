export function spotifyPlaylistUri(value: string): string {
  const input = value.trim();
  if (!input) return '';
  if (/^spotify:playlist:[A-Za-z0-9]{22}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{22})\/?$/);
    if (url.protocol === 'https:' && url.hostname === 'open.spotify.com' && match) return `spotify:playlist:${match[1]}`;
  } catch {}
  throw new Error('Bitte einen gültigen Spotify-Playlist-Link oder eine Playlist-URI eingeben.');
}
