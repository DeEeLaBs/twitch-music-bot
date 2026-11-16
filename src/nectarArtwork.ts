export function nectarArtworkKey(title: string, artist: string, album = ''): string {
  return JSON.stringify([title, artist, album].map(value => value.trim().toLowerCase()));
}

export function nectarArtworkMatches(title: string, artist: string, album: string | undefined, candidate: { title?: string; artist?: string; album?: string }): boolean {
  const normalize = (value = '') => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const cleanTitle = (value = '') => value.replace(/\(music from the motion picture\)/gi, '').trim();
  const unknownArtist = !artist.trim() || /^(unbekannter interpret|unknown artist)$/i.test(artist.trim());
  return Boolean(normalize(title)) && normalize(cleanTitle(title)) === normalize(cleanTitle(candidate.title))
    && (unknownArtist ? Boolean(album && candidate.artist) : normalize(artist) === normalize(candidate.artist))
    && (!album || normalize(album) === normalize(candidate.album));
}

export function nectarArtworkCandidate<T extends { title?: string; artist?: string; album?: string }>(title: string, artist: string, album: string | undefined, candidates: T[]): T | undefined {
  let matches = candidates.filter(candidate => nectarArtworkMatches(title, artist, album, candidate));
  // Covers belong to albums. A known artist plus exact album is sufficient even
  // when the phone reports the album name as the song title.
  if (!matches.length && album?.trim() && artist.trim() && !/^(unbekannter interpret|unknown artist)$/i.test(artist.trim())) {
    matches = candidates.filter(candidate => nectarArtworkMatches(candidate.title || '', artist, album, candidate));
  }
  const identities = new Set(matches.map(candidate => nectarArtworkKey('', candidate.artist || '', candidate.album)));
  return identities.size === 1 ? matches[0] : undefined;
}
