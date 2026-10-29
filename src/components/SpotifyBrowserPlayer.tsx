import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

function embedUrl(type: string, id: string) {
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`;
}

function fromUri(uri: string) {
  const match = /^spotify:(track|episode|playlist|album|artist|show):([A-Za-z0-9]{22})$/.exec(uri);
  return match ? embedUrl(match[1], match[2]) : '';
}

async function spotifyEmbedSrc() {
  const tokenResponse = await fetch('/api/spotify/token');
  const tokenPayload = await tokenResponse.json() as { accessToken?: string; error?: string };
  if (!tokenResponse.ok || !tokenPayload.accessToken) throw new Error(tokenPayload.error || 'Spotify is not connected.');
  const headers = { Authorization: `Bearer ${tokenPayload.accessToken}` };

  const playing = await fetch('https://api.spotify.com/v1/me/player', { headers });
  if (playing.ok && playing.status !== 204) {
    const body = await playing.json() as { context?: { uri?: string }; item?: { id?: string; type?: string } };
    const item = body.item?.id && /^[A-Za-z0-9]{22}$/.test(body.item.id) && (body.item.type === 'track' || body.item.type === 'episode')
      ? embedUrl(body.item.type, body.item.id)
      : '';
    if (item) return item;
    const context = fromUri(body.context?.uri || '');
    if (context) return context;
  }

  const lists = await fetch('https://api.spotify.com/v1/me/playlists?limit=1', { headers });
  if (lists.ok) {
    const body = await lists.json() as { items?: { id?: string }[] };
    if (body.items?.[0]?.id) return embedUrl('playlist', body.items[0].id);
  }

  const recent = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', { headers });
  if (recent.ok) {
    const body = await recent.json() as { items?: { track?: { id?: string; type?: string } }[] };
    const track = body.items?.[0]?.track;
    if (track?.id && track.type) return embedUrl(track.type, track.id);
  }
  return '';
}

export function SpotifyBrowserPlayer() {
  const [src, setSrc] = useState('');
  const [note, setNote] = useState('');
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';

  useEffect(() => {
    let disposed = false;
    spotifyEmbedSrc()
      .then(url => {
        if (disposed) return;
        if (!url) setNote(english ? 'Spotify has nothing to open in this tab yet.' : 'Spotify hat in diesem Tab noch nichts zum Öffnen.');
        else setSrc(url);
      })
      .catch(error => {
        if (disposed) return;
        setNote(error instanceof Error ? error.message : (english ? 'Spotify could not open in this tab.' : 'Spotify konnte in diesem Tab nicht geöffnet werden.'));
      });
    return () => { disposed = true; };
  }, [english]);

  if (note) return <div className="absolute inset-0 z-20 grid place-items-center bg-neutral-950 p-6 text-center text-sm text-amber-200">{note}</div>;
  if (!src) {
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-neutral-950 text-sm text-neutral-300">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
          <span>{english ? 'Opening Spotify…' : 'Spotify wird geöffnet…'}</span>
        </div>
      </div>
    );
  }
  const compact = src.includes('/embed/track/') || src.includes('/embed/episode/');
  return (
    <div className={`absolute inset-0 z-20 bg-neutral-950 ${compact ? 'flex items-center px-4' : ''}`}>
      <iframe
        title="Spotify"
        src={src}
        className={compact ? 'h-[152px] w-full border-0' : 'h-full w-full border-0'}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="eager"
      />
    </div>
  );
}
