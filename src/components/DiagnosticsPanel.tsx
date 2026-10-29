import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, Download } from 'lucide-react';

interface Diagnostics {
  timestamp: number;
  twitch: {
    connected: boolean; channel: string; username: string; credentialsConfigured: boolean;
    channelPointsEnabled: boolean; rewardSelected: boolean;
    reconnect: { attempt: number; authFailed: boolean; nextDelayMs: number };
  };
  youtubeMusic: { connected: boolean; simulationMode: boolean; companionUrl: string; tokenConfigured: boolean; lastError: string; commandScheduler?: { queueDepth:number; lastCommandAt:number; volumePending:boolean }; circuitBreaker?: {open:boolean;failures:number;retryAt:number|null} };
  queue: { length: number; currentSong: string; status: string };
  resolver: { cacheEntries: number; cachePreloaded?: number; cacheHits: number; cacheMisses: number; cacheHitRate?: string; cacheTtlMinutes: number; negativeCacheEntries?: number; inFlight?: number; circuitBreaker?: {open:boolean;failures:number;retryAt:number|null}; lastError?: string };
  security?: { mode:string; fileExists:boolean };
  channelPoints?: { ok?: boolean; reason?: string; reward?: { id?: string; title?: string; cost?: number; isEnabled?: boolean; isUserInputRequired?: boolean } } | null;
  plugins?: { loaded:string[]; errors:string[] };
  persistence?: { dataDir:string; configBackup:boolean; logRotation:string }; 
}

export const DiagnosticsPanel: React.FC<{ language: 'de' | 'en' }> = ({ language }) => {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const en = language === 'en';

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/diagnostics');
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'Diagnostics failed');
      setData(payload);
    } catch (err) { setError(err instanceof Error ? err.message : 'Diagnostics failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const Status = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
      <span className="text-neutral-200">{text}</span>
    </div>
  );

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-purple-400"/><h2 className="font-bold text-neutral-100">{en ? 'System diagnostics' : 'Systemdiagnose'}</h2></div>
      <div className="flex gap-2"><a href="/api/diagnostics/export" className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"><Download className="w-4 h-4" />{en ? 'Export' : 'Exportieren'}</a><button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>{en ? 'Refresh' : 'Aktualisieren'}
      </button></div>
    </div>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {data && <div className="grid md:grid-cols-2 gap-4">
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">Twitch</h3>
        <Status ok={data.twitch.connected} text={data.twitch.connected ? (en ? 'Connected' : 'Verbunden') : (en ? 'Not connected' : 'Nicht verbunden')} />
        <Status ok={data.twitch.credentialsConfigured} text={`${en ? 'Credentials configured' : 'Zugangsdaten eingerichtet'}: ${data.twitch.credentialsConfigured ? '✓' : '—'}`} />
        <p className="text-xs text-neutral-400">#{data.twitch.channel || '—'} · @{data.twitch.username || '—'}</p>
        <p className="text-xs text-neutral-400">Channel Points: {data.twitch.channelPointsEnabled ? (data.twitch.rewardSelected ? 'aktiv' : 'aktiv, Reward fehlt') : 'aus'}</p>
        {data.twitch.reconnect.authFailed && <p className="text-xs text-amber-300">{en ? 'Reconnect paused after authentication failure.' : 'Reconnect nach Authentifizierungsfehler pausiert.'}</p>}
      </section>
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">YouTube Music</h3>
        <Status ok={data.youtubeMusic.connected || data.youtubeMusic.simulationMode} text={data.youtubeMusic.connected ? (en ? 'Companion connected' : 'Companion verbunden') : data.youtubeMusic.simulationMode ? 'Simulationsmodus' : (en ? 'Companion disconnected' : 'Companion getrennt')} />
        <p className="text-xs text-neutral-400 break-all">{data.youtubeMusic.companionUrl}</p>
        {data.youtubeMusic.lastError && <p className="text-xs text-amber-300">{data.youtubeMusic.lastError}</p>}
        <p className="text-xs text-neutral-500">{en ? 'Command queue' : 'Befehlswarteschlange'}: {data.youtubeMusic.commandScheduler?.queueDepth || 0} · {en ? 'Volume pending' : 'Lautstärke ausstehend'}: {data.youtubeMusic.commandScheduler?.volumePending ? '✓' : '—'}</p>
        {data.youtubeMusic.circuitBreaker?.open && <p className="text-xs text-amber-300">{en ? 'Companion circuit breaker is active.' : 'Companion-Circuit-Breaker ist aktiv.'}</p>}
      </section>
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-2">
        <h3 className="font-semibold">{en ? 'Queue' : 'Warteschlange'}</h3>
        <p className="text-sm text-neutral-300">{data.queue.length} {en ? 'requests' : 'Requests'} · {data.queue.currentSong || '—'}</p>
        <p className="text-xs text-neutral-500">Status: {data.queue.status}</p>
      </section>
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-2">
        <h3 className="font-semibold">Song Resolver</h3>
        <p className="text-sm text-neutral-300">{en ? 'Cache entries' : 'Cache-Einträge'}: {data.resolver.cacheEntries}{data.resolver.cachePreloaded ? ` (${data.resolver.cachePreloaded} ${en ? 'preloaded' : 'vorgeladen'})` : ''}</p>
        <p className="text-sm text-neutral-300">{en ? 'Hits' : 'Treffer'}: {data.resolver.cacheHits} · {en ? 'Misses (live searches)' : 'Misses (Live-Suchen)'}: {data.resolver.cacheMisses}{data.resolver.cacheHitRate ? ` · ${en ? 'Hit rate' : 'Trefferquote'}: ${data.resolver.cacheHitRate}` : ''}</p>
        <p className="text-xs text-neutral-500">TTL: {data.resolver.cacheTtlMinutes} min · Negative: {data.resolver.negativeCacheEntries || 0} · In-flight: {data.resolver.inFlight || 0}</p>
        {data.resolver.circuitBreaker?.open && <p className="text-xs text-amber-300">Circuit Breaker aktiv – externe Suche pausiert kurz.</p>}
        {data.resolver.lastError && <p className="text-xs text-amber-300 break-words">{en ? 'Last search issue' : 'Letztes Suchproblem'}: {data.resolver.lastError}</p>}
      </section>
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-2"><h3 className="font-semibold">{en?'Security & persistence':'Sicherheit & Persistenz'}</h3><p className="text-sm text-neutral-300">Secrets: {data.security?.mode || '—'} · Backup: {data.persistence?.configBackup ? '✓':'—'}</p><p className="text-xs text-neutral-500">Log rotation: {data.persistence?.logRotation || '—'}</p></section>
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-2"><h3 className="font-semibold">Plugins / Channel Points</h3><p className="text-sm text-neutral-300">Plugins: {data.plugins?.loaded?.length || 0} · Fehler: {data.plugins?.errors?.length || 0}</p><p className="text-xs text-neutral-500 break-words">Reward: {data.channelPoints ? JSON.stringify(data.channelPoints) : '—'}</p></section>
    </div>}
  </div>;
};
