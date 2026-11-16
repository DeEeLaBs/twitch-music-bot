import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface RestartIpc {
  invoke(channel: string): Promise<unknown>;
  on(channel:string, listener:()=>void):unknown;
  removeListener(channel:string, listener:()=>void):unknown;
}
function getRestartIpc(): RestartIpc | undefined {
  try {
    const nativeWindow = window as unknown as { require?: (name: string) => { ipcRenderer?: RestartIpc } };
    return nativeWindow.require?.('electron').ipcRenderer;
  } catch { return undefined; }
}

export function LocalRestartButton({ className = '' }: { className?: string }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    void getRestartIpc()?.invoke('desktop:can-restart-local').then(value => {
      if (active) setAvailable(value === true);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const restart = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const saves: Promise<void>[] = [];
      const leave = new CustomEvent('overlay:before-leave', {
        cancelable: true,
        detail: { waitUntil: (task: Promise<void>) => saves.push(task) }
      });
      if (!window.dispatchEvent(leave)) { busyRef.current = false; setBusy(false); return; }
      await Promise.all(saves);
      await getRestartIpc()?.invoke('desktop:restart-local');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Neustart fehlgeschlagen.');
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    const ipc = getRestartIpc();
    const request = () => { void restart(); };
    ipc?.on('desktop:request-restart-local', request);
    return () => { ipc?.removeListener('desktop:request-restart-local', request); };
  }, [available, restart]);

  if (!available) return null;
  return <div className={className}>
    <button type="button" aria-keyshortcuts="Control+Alt+R" title="Bot neu starten (Strg+Alt+R)" disabled={busy} onClick={() => void restart()} className="inline-flex items-center gap-2 rounded-xl border border-amber-700 px-3 py-2 text-sm hover:bg-amber-950 disabled:opacity-50">
      <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
      {busy ? 'Bot startet neu …' : 'Bot neu starten'}
    </button>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </div>;
}
