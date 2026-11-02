import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, Copy, Pencil, Trash2, Monitor } from 'lucide-react';
import { apiFetch } from '../apiClient.ts';
import type { OverlayOptions } from '../overlayOptions.ts';

export interface OverlayDocument { id: string; name: string; options: OverlayOptions }
export async function overlayRequest(url: string, init?: RequestInit) {
  const response = await apiFetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Overlay-Anfrage fehlgeschlagen.');
  return body;
}
export function OverlayCollection({ language, children, embedded = false }: {
  language: 'de' | 'en'; embedded?: boolean; children: (document: OverlayDocument, onDirty: (dirty: boolean) => void, registerFlush: (flush: (() => Promise<void>) | null) => void, onSaved: (document: OverlayDocument) => void, actionHost: HTMLDivElement | null) => ReactNode;
}) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const [items, setItems] = useState<Array<{ id: string; name: string; width?: number; height?: number; widgets?: number }>>([]);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const registerFlush = useCallback((flush: (() => Promise<void>) | null) => {flushRef.current = flush;}, []);
  const onSaved = useCallback((saved: OverlayDocument) => {setError('');setItems(current=>current.map(item=>item.id===saved.id?{...item,width:saved.options.scene?.design.width??1920,height:saved.options.scene?.design.height??1080,widgets:saved.options.scene?.widgets.length??1}:item));}, []);
  const [document, setDocument] = useState<OverlayDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [actionHost, setActionHost] = useState<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'create' | 'rename' | 'duplicate' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const refresh = async () => {
    const result = await overlayRequest('/api/v1/overlays');
    setItems(result.overlays);
    return result.overlays as Array<{ id: string; name: string }>;
  };
  useEffect(() => {
    let cancelled = false;
    void overlayRequest('/api/v1/overlays').then(async result => {
      let remembered: string | null = null;
      try {remembered = localStorage.getItem('musicbot_selected_overlay');} catch {}
      const first = result.overlays.find((item: {id: string}) => item.id === remembered) || result.overlays[0];
      const doc = first ? await overlayRequest(`/api/v1/overlays/${first.id}`) : null;
      if (!cancelled) { setItems(result.overlays); setDocument(doc); }
    }).catch(reason => { if (!cancelled) setError(String(reason.message)); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {try {if(document)localStorage.setItem('musicbot_selected_overlay',document.id);} catch {}}, [document?.id]);
  const saveCurrent = async () => {await flushRef.current?.();};
  const select = async (id: string) => {
    setBusy(true); setError('');
    try { await saveCurrent(); const next = await overlayRequest(`/api/v1/overlays/${id}`); setDocument(next); setDirty(false); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await saveCurrent();
      const next = await overlayRequest(mode === 'rename' ? `/api/v1/overlays/${document!.id}` : '/api/v1/overlays', {
        method: mode === 'rename' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...(mode === 'duplicate' ? { sourceId: document!.id } : {}) })
      });
      await refresh();
      if (mode === 'rename') setDocument(current => current ? { ...current, name: next.name } : current);
      else { setDocument(next); setDirty(false); }
      setMode(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!document) return;
    setBusy(true); setError('');
    try {
      await saveCurrent();
      await overlayRequest(`/api/v1/overlays/${document.id}`, { method: 'DELETE' });
      const remaining = await refresh();
      setDocument(remaining.length ? await overlayRequest(`/api/v1/overlays/${remaining[0].id}`) : null);
      setDirty(false); setDeleting(false);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <div className={`overlay-collection ${embedded ? 'is-embedded' : ''}`}>
    <header className="overlay-collection-bar" aria-label={ui('Overlay-Verwaltung', 'Overlay management')}>
      <div className="overlay-collection-title"><strong>{ui('Overlay-Designer', 'Overlay designer')}</strong></div>
      <div className="overlay-collection-actions">
        <button type="button" className="overlay-create" disabled={busy} onClick={() => {setMode('create');setDeleting(false);setName('');}}><Plus size={16} aria-hidden="true"/>{ui('Neues Overlay', 'New overlay')}</button>
        {(['rename', 'duplicate'] as const).map(action => <button key={action} type="button" disabled={busy || !document} onClick={() => {
          setMode(action);setDeleting(false);setName(action === 'rename' ? document!.name : `${document!.name} ${ui('Kopie', 'copy')}`.slice(0,80));
        }}>{action === 'rename' ? <Pencil size={15} aria-hidden="true"/> : <Copy size={15} aria-hidden="true"/>}{action === 'rename' ? ui('Umbenennen', 'Rename') : ui('Duplizieren', 'Duplicate')}</button>)}
        <button type="button" className="overlay-delete" disabled={busy || !document} onClick={() => {setDeleting(true);setMode(null);}}><Trash2 size={15} aria-hidden="true"/>{ui('Löschen', 'Delete')}</button>
        <div className="overlay-copy-action" ref={setActionHost} inert={busy} />
      </div>
    </header>
    <div className="overlay-designs" onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const current=tabs.indexOf(event.target as HTMLButtonElement);if(current<0||busy)return;
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next]?.focus();tabs[next]?.click();
    }} role="tablist" aria-label={ui('Deine Overlays', 'Your overlays')}>
      {items.map((item,index) => <button key={item.id} id={`overlay-tab-${item.id}`} type="button" role="tab" aria-selected={document?.id === item.id} tabIndex={document?.id === item.id ? 0 : -1} aria-controls="overlay-design-panel" disabled={busy} className={`overlay-design-card ${document?.id === item.id ? 'is-active' : ''}`} onClick={() => void select(item.id)}>
        <span className="overlay-design-icon" aria-hidden="true"><Monitor size={24}/><small>{String(index+1).padStart(2,'0')}</small></span>
        <span className="overlay-design-info"><strong>{item.name}</strong><small>{item.width || 1920} × {item.height || 1080} · {item.widgets ?? 1} {ui('Ebenen', 'layers')}</small></span>
        {document?.id === item.id && <span className="overlay-design-active">{dirty ? ui('Ungespeichert', 'Unsaved') : ui('In Bearbeitung', 'Editing')}</span>}
      </button>)}
      {!items.length && <span className="canvas-note">{ui('Erstelle dein erstes Overlay.', 'Create your first overlay.')}</span>}
    </div>
    {mode && <form className="overlay-collection-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label>{ui('Overlay-Name', 'Overlay name')} <input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{ui('Übernehmen', 'Apply')}</button><button type="button" disabled={busy} onClick={() => setMode(null)}>{ui('Abbrechen', 'Cancel')}</button>
      {mode === 'duplicate' && <span>{ui('Der aktuelle Entwurf wird gespeichert und unabhängig kopiert.', 'The current design is saved and copied independently.')}</span>}
    </form>}
    {deleting && <div className="overlay-collection-form" role="alertdialog" aria-label={ui('Overlay löschen', 'Delete overlay')}>
      <p>{ui('Dieses Overlay wirklich löschen? Seine OBS-Adresse ist danach nicht mehr verfügbar.', 'Delete this overlay? Its OBS URL will no longer be available.')}</p>
      <button type="button" disabled={busy} onClick={() => void remove()}>{ui('Endgültig löschen', 'Delete permanently')}</button><button type="button" disabled={busy} onClick={() => setDeleting(false)}>{ui('Abbrechen', 'Cancel')}</button>
    </div>}
    {error && <p role="alert" className="overlay-collection-error">{error}</p>}
    {document ? <div id="overlay-design-panel" role="tabpanel" aria-labelledby={`overlay-tab-${document.id}`} className="overlay-collection-canvas" inert={busy} aria-busy={busy} key={document.id}>{children(document, setDirty, registerFlush, onSaved, actionHost)}</div> : <p className="canvas-note">{ui('Erstelle ein Overlay, um zu beginnen.', 'Create an overlay to begin.')}</p>}
  </div>;
}
