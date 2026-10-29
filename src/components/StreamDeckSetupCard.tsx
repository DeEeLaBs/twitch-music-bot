import { useCallback, useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { apiFetch } from '../apiClient.ts';
import { describeStreamDeck, type StreamDeckStatusInfo } from '../streamDeckText.ts';

const TONE_CLASSES = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  neutral: 'border-neutral-700 text-neutral-400'
} as const;

export function StreamDeckSetupCard({ language }: { language: 'de' | 'en' }) {
  const de = language === 'de';
  const [status, setStatus] = useState<StreamDeckStatusInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Counts install clicks (not a boolean) so a second click starts a fresh 60 second refresh window.
  const [installs, setInstalls] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch('/api/streamdeck/status');
      if (!response.ok) throw new Error('status');
      setStatus(await response.json() as StreamDeckStatusInfo);
    } catch {
      // An older server without this route: the card simply stays hidden.
      setStatus(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // After the user confirms the install inside the Stream Deck app, pick up the new version.
  useEffect(() => {
    if (installs === 0) return undefined;
    const timer = window.setInterval(() => void refresh(), 3000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 60000);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); };
  }, [installs, refresh]);

  if (!status) return null;
  const view = describeStreamDeck(status, language);

  const install = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/streamdeck/install', { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || (de ? 'Das Plugin konnte nicht geöffnet werden.' : 'The plugin could not be opened.'));
      }
      setInstalls(count => count + 1);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="step-streamdeck" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{de ? 'Elgato Stream Deck' : 'Elgato Stream Deck'}</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {de ? 'Steuere Wiedergabe, Warteschlange und Chat-Regeln per Tastendruck.' : 'Control playback, the queue and chat rules with a key press.'}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium self-start sm:self-auto ${TONE_CLASSES[view.tone]}`}>
          {view.badge}
        </span>
      </div>

      <p className="text-xs text-neutral-300">{view.message}</p>

      {view.action && (
        <button
          type="button"
          onClick={() => void install()}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          {busy ? (de ? 'Öffne…' : 'Opening…') : view.action}
        </button>
      )}
      {installs > 0 && !error && (
        <p role="status" className="text-xs text-emerald-300">
          {de ? 'Die Stream-Deck-App sollte jetzt die Installation anbieten. Bestätige sie dort.' : 'The Stream Deck app should now offer the installation. Confirm it there.'}
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </section>
  );
}
