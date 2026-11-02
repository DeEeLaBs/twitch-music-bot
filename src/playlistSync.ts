export type PlaylistSyncState = 'pending' | 'added' | 'already_present' | 'needs_match' | 'not_found' | 'failed';
export interface PlaylistSync { state: PlaylistSyncState; playlist?: string; uri?: string; message?: string; updatedAt: number; retryAfter?: number }
const labels: Record<PlaylistSyncState, [string, string]> = {
  pending: ['Ausstehend', 'Pending'], added: ['Auf Spotify hinzugefügt', 'Added to Spotify'],
  already_present: ['Bereits auf Spotify enthalten', 'Already on Spotify'], needs_match: ['Zuordnung offen', 'Match unclear'],
  not_found: ['Kein Spotify-Treffer', 'No Spotify match'], failed: ['Spotify-Übertragung fehlgeschlagen', 'Spotify transfer failed']
};
export function playlistSyncLabel(sync: PlaylistSync | undefined, language: 'de' | 'en') {
  return sync ? labels[sync.state]?.[language === 'de' ? 0 : 1] || '—' : (language === 'de' ? 'Historischer Eintrag' : 'Historical entry');
}
