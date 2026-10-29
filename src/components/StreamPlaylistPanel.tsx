import { useCallback, useEffect, useState } from 'react';
import type { BotConfig } from '../types.ts';
import type { StreamPlaylistEntry } from '../server/streamPlaylistService.ts';
import { apiFetch } from '../apiClient.ts';
import { useTranslations } from '../translations.ts';

export function StreamPlaylistPanel({ config }: { config: BotConfig }) {
  const t = useTranslations(config.language || 'en');
  const [items, setItems] = useState<StreamPlaylistEntry[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await apiFetch('/api/stream-playlist', {signal});
      if (!response.ok) throw new Error();
      const data: {items: StreamPlaylistEntry[]} = await response.json();
      if (!signal?.aborted) { setItems(data.items); setError(false); }
    } catch { if (!signal?.aborted) setError(true); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const refresh = () => void load(controller.signal);
    window.addEventListener('playlist:track_added', refresh);
    const timer = window.setInterval(() => void load(controller.signal), 10000);
    return () => { window.removeEventListener('playlist:track_added', refresh); controller.abort(); window.clearInterval(timer); };
  }, [load]);
  const remove = async (id: string) => {
    setBusy(id);
    try {
      const response = await apiFetch(`/api/stream-playlist/${encodeURIComponent(id)}`, {method:'DELETE'});
      if (!response.ok) throw new Error();
      await load();
    } catch { setError(true); } finally { setBusy(null); }
  };
  const exportFile = (csv: boolean) => {
    const cell = (value: string) => '"' + value.replace(/"/g, '""') + '"';
    const text = csv
      ? [['Title','Artist','Provider','Added by','Date','URL'], ...items.map(item => [item.title,item.artist,item.playbackProvider,item.addedBy,new Date(item.addedAt).toISOString(),item.url])].map(row => row.map(value => cell(/^[=+@\-\t\r]/.test(value) ? "'" + value : value)).join(',')).join('\r\n')
      : items.map(item => `${item.title} - ${item.artist} (${item.url})`).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + text], {type: csv ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `stream-playlist.${csv ? 'csv' : 'txt'}`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const configured = config.streamPlaylistUrl?.trim() || config.spotifyFallbackPlaylist?.trim() || '';
  const playlistUrl = configured.replace(/^spotify:playlist:/, 'https://open.spotify.com/playlist/');
  const safeUrl = /^https:\/\//.test(playlistUrl) ? playlistUrl : '';
  return <section className="mt-6 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
    <div className="flex flex-wrap gap-3 items-center">
      <h2 className="text-lg font-semibold text-white mr-auto">{t('streamPlaylistTitle')}</h2>
      <button className="text-sm text-purple-300" onClick={() => exportFile(false)}>{t('streamPlaylistExport')} (.txt)</button>
      <button className="text-sm text-purple-300" onClick={() => exportFile(true)}>CSV</button>
      {safeUrl && <a className="text-sm text-purple-300" href={safeUrl} target="_blank" rel="noreferrer">{t('streamPlaylistOpen')}</a>}
    </div>
    {error && <p role="alert" className="text-red-300">{t('streamPlaylistError')}</p>}
    {!items.length ? <p className="text-neutral-400">{t('streamPlaylistEmpty')}</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left text-neutral-300">
      <thead><tr><th>{t('streamPlaylistTrack')}</th><th>Provider</th><th>{t('streamPlaylistAddedBy')}</th><th>{t('streamPlaylistDate')}</th><th /></tr></thead>
      <tbody>{items.map(item => <tr key={item.id} className="border-t border-neutral-800">
        <td className="py-3"><div className="flex items-center gap-3">{item.albumArtUrl ? <img src={item.albumArtUrl} alt="" className="w-10 h-10 rounded object-cover" /> : <span aria-hidden="true" className="w-10 h-10 rounded bg-purple-950 flex items-center justify-center">♪</span>}<span><strong className="text-white">{item.title}</strong><br />{item.artist}</span></div></td>
        <td><span className="rounded px-2 py-1 bg-neutral-800">{item.playbackProvider === 'spotify' ? 'Spotify' : item.playbackProvider === 'youtube_music' ? 'YouTube' : '—'}</span></td>
        <td>@{item.addedBy}</td><td>{new Date(item.addedAt).toLocaleString(config.language === 'de' ? 'de-DE' : 'en-GB')}</td>
        <td><button disabled={busy !== null} className="text-red-300 disabled:opacity-50" onClick={() => void remove(item.id)}>{t('streamPlaylistDelete')}</button></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
