import { useEffect, useRef, useState } from 'react';
import { Clock3, Play, Pause, RotateCcw, Plus, Minus, Link2, Save, Check, Radio } from 'lucide-react';
import { apiFetch } from '../apiClient.ts';
import { COUNTDOWN_IDS, DONATION_PROVIDERS, defaultCountdown, emptyCountdownState, formatCountdown, remainingCountdown,
  type CountdownAction, type CountdownId, type CountdownProfile, type CountdownRun, type CountdownState, type DonationProvider } from '../countdown.ts';
import type { DonationStatus } from '../server/countdownDonations.ts';
import './CountdownStudio.css';
import { AlertFontField } from './alert-creator/AlertFontField.tsx';
import { alertFontFaceCss } from '../alertFonts.ts';

type Snapshot = CountdownState & { serverNow: number; storageError?: string };
type OverlayState = { profile: CountdownProfile; run: CountdownRun; serverNow: number };
const STATUS = { idle: 'Bereit', running: 'Läuft', paused: 'Pausiert', finished: 'Beendet' };
const PROVIDERS = { streamelements: 'StreamElements', streamlabs: 'Streamlabs', tipeeestream: 'TipeeeStream' };
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiFetch(url, { signal: AbortSignal.timeout(8000), ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Anfrage fehlgeschlagen.');
  return payload;
}
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  return now;
}
export function DurationInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const parts = [Math.floor(value / 3600), Math.floor(value / 60) % 60, Math.floor(value % 60)];
  return <fieldset className="cd-duration"><legend>{label}</legend><div>{parts.map((part, i) => <label key={i}>
    <input aria-label={`${label}: ${['Stunden', 'Minuten', 'Sekunden'][i]}`} type="number" min="0" max={i === 0 ? 8784 : 59} value={part} onChange={event => {
      const next = [...parts]; next[i] = Math.max(0, Math.min(i === 0 ? 8784 : 59, Number(event.target.value) || 0));
      onChange(next[0] * 3600 + next[1] * 60 + next[2]);
    }} /><span>{['Std', 'Min', 'Sek'][i]}</span></label>)}</div></fieldset>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="cd-toggle"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span>{label}</span></label>;
}
export function CountdownFace({ profile, run, now, preview = false }: { profile: CountdownProfile; run: CountdownRun; now: number; preview?: boolean }) {
  const hidden = !preview && (run.status === 'idle' || (run.status === 'finished' && profile.finish.hideEnabled && now >= run.completedAt + profile.finish.hideAfterSeconds * 1000));
  const bonus = run.lastBonus && now - run.lastBonus.at < 10000;
  return <div className={`cd-face ${run.status === 'paused' ? 'is-paused' : ''}`} style={{ color: profile.look.color, background: profile.look.background,
    fontFamily: profile.look.font, visibility: hidden ? 'hidden' : 'visible' }}>
    <style>{alertFontFaceCss(profile.look.fonts || [])}</style>
    <div className="cd-face-title">{profile.title}</div>
    <div className="cd-digits" style={{ fontSize: profile.look.fontSize }}>{formatCountdown(remainingCountdown(profile, run, now))}</div>
    {run.status === 'paused' && <div className="cd-face-meta">Pausiert</div>}
    {profile.look.showBonus && bonus && <div className="cd-bonus">+{formatCountdown(run.lastBonus!.milliseconds)} · {run.lastBonus!.text}</div>}
    {profile.look.showTotal && <div className="cd-face-meta">Insgesamt hinzugefügt: {formatCountdown(run.totalAddedMs)}</div>}
    {run.status === 'finished' && profile.finish.alertEnabled && <div className="cd-finish">{profile.finish.text}</div>}
  </div>;
}

export function CountdownOverlayPage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('profile') || 'streamstart', token = params.get('token') || '';
  const [data, setData] = useState<OverlayState | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState('');
  const now = useNow(), completed = useRef('');
  useEffect(() => {
    const previous = document.body.style.background;
    document.body.style.background = 'transparent';
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await request<OverlayState>(`/api/countdowns/overlay/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
        if (active) { setOffset(result.serverNow - Date.now()); setData(result); setError(''); }
      } catch { if (active) setError('Countdown-Verbindung prüfen'); }
      if (active) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); document.body.style.background = previous; };
  }, [id, token]);
  useEffect(() => {
    if (!data || data.run.status !== 'finished' || completed.current === data.run.runId) return;
    completed.current = data.run.runId;
    if (!data.profile.finish.soundEnabled || data.serverNow - data.run.completedAt > 15000) return;
    const key = `countdown-sound-${data.profile.id}`;
    try { if (localStorage.getItem(key) === data.run.runId) return; localStorage.setItem(key, data.run.runId); } catch { /* OBS may disable storage */ }
    if (data.profile.finish.soundUrl) {
      const audio = new Audio(data.profile.finish.soundUrl);
      void audio.play().catch(() => setError('OBS-Audiowiedergabe aktivieren'));
    } else {
      const context = new AudioContext();
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.15, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.8);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.8);
      oscillator.onended = () => { void context.close(); };
      void context.resume().catch(() => setError('OBS-Audiowiedergabe aktivieren'));
    }
  }, [data]);
  return <div className="cd-obs">{data && <CountdownFace profile={data.profile} run={data.run} now={now + offset} />}{error && <small className="cd-obs-error">{error}</small>}</div>;
}

export function CountdownStudio() {
  const [state, setState] = useState<Snapshot>({ ...emptyCountdownState(), serverNow: Date.now() });
  const [id, setId] = useState<CountdownId>('streamstart'), [draft, setDraft] = useState(defaultCountdown('streamstart'));
  const [loaded, setLoaded] = useState(false), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('time'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [token, setToken] = useState('');
  const [delta, setDelta] = useState(60), [offset, setOffset] = useState(0);
  const now = useNow();
  const initialized = useRef(false);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await request<Snapshot>('/api/countdowns');
        if (active) {
          setState(data); setOffset(data.serverNow - Date.now()); setLoaded(true);
          if (data.storageError) setError(data.storageError);
          if (!initialized.current) { setDraft(data.profiles.streamstart); initialized.current = true; }
        }
      } catch (e) { if (active) setError(String((e as Error).message)); }
      if (active) timer = setTimeout(poll, 1000);
    };
    void poll();
    void request<{ token: string }>('/api/overlay/token').then(data => { if (active) setToken(data.token); }).catch(() => {});
    return () => { active = false; clearTimeout(timer); };
  }, []);
  useEffect(() => { if (initialized.current && !dirty) setDraft(state.profiles[id]); }, [state.profiles, id, dirty]);
  const edit = (patch: Partial<CountdownProfile>) => { setDraft(current => ({ ...current, ...patch })); setDirty(true); setNotice(''); };
  const bonus = (patch: Partial<CountdownProfile['bonuses']>) => edit({ bonuses: { ...draft.bonuses, ...patch } });
  const finish = (patch: Partial<CountdownProfile['finish']>) => edit({ finish: { ...draft.finish, ...patch } });
  const look = (patch: Partial<CountdownProfile['look']>) => edit({ look: { ...draft.look, ...patch } });
  const act = async (action: CountdownAction) => {
    setBusy(true); setError('');
    try { setState(await request<Snapshot>(`/api/countdowns/${id}/control`, { action, ...(action === 'add' ? { seconds: delta } : {}) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try { const data = await request<Snapshot>(`/api/countdowns/${id}/config`, draft); setState(data); setDraft(data.profiles[id]); setDirty(false); setNotice('Einstellungen gespeichert'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const run = state.runs[id];
  const live = run.status === 'running' || run.status === 'paused';
  const overlayUrl = `${window.location.origin}/overlay/countdown?profile=${id}&token=${encodeURIComponent(token)}`;
  const tabs = [['time', 'Zeit & Grenzen'], ['bonuses', 'Zeitboni'], ['finish', 'Bei null'], ['look', 'Darstellung'], ['connections', 'Spendenanbieter']];
  return <section className="cd-studio" aria-label="Countdown Studio">
    <header className="cd-header"><div><span className="cd-eyebrow"><Clock3 size={15} /> STREAM TOOLS</span><h1>Countdown Studio</h1><p>Streamstart planen. Subathon verlängern. Alles an einem Ort.</p></div>
      <button className="cd-primary" disabled={!loaded || busy || !dirty} onClick={() => void save()}><Save size={17} /> Speichern{dirty ? ' *' : ''}</button></header>
    {error && <div role="alert" className="cd-error">{error}</div>}{notice && <div role="status" className="cd-success"><Check size={16} /> {notice}</div>}
    <div className="cd-layout"><aside className="cd-sidebar"><span className="cd-eyebrow">DEINE PROFILE</span>{COUNTDOWN_IDS.map(profile => <button key={profile} disabled={dirty && profile !== id} aria-pressed={profile === id} className={`cd-profile ${profile === id ? 'active' : ''}`} onClick={() => { setId(profile); setDraft(state.profiles[profile]); setDirty(false); }}>
      <Clock3 size={20} /><span><strong>{profile === 'streamstart' ? 'Streamstart' : 'Subathon'}</strong><small>{STATUS[state.runs[profile].status]}</small></span></button>)}
      <p>Profile haben eigene OBS-Links und Zeitregeln. Sie können unabhängig laufen.</p>
      <div className="cd-chat-help"><strong>Moderator-Befehl</strong><code>!timer {id} pause</code><small>start · pause · resume · reset<br />add 60 · add -60</small></div>
    </aside><div className="cd-content">
      <div className="cd-live-card"><div className="cd-live-top"><span><Radio size={15} /> LIVE-VORSCHAU</span><span className={`cd-status ${run.status}`}>{STATUS[run.status]}</span></div>
        <div className="cd-preview"><CountdownFace profile={draft} run={run} now={now + offset} preview /></div>
        <div className="cd-controls"><button disabled={!loaded || busy || dirty} className="cd-primary" onClick={() => void act(run.status === 'running' ? 'pause' : run.status === 'paused' ? 'resume' : 'start')}>
          {run.status === 'running' ? <Pause size={17} /> : <Play size={17} />}{run.status === 'running' ? 'Pausieren' : run.status === 'paused' ? 'Fortsetzen' : 'Starten'}</button>
          <button disabled={!loaded || busy || run.status === 'idle'} onClick={() => { if (window.confirm('Countdown zurücksetzen? Die aktuelle Laufzeit wird verworfen.')) void act('reset'); }}><RotateCcw size={16} /> Zurücksetzen</button>
          <label className="cd-delta">Zeit ändern (Sek.)<input type="number" min={-31622400} max={31622400} value={delta} onChange={e => setDelta(Number(e.target.value))} /></label>
          <button disabled={!live || busy} onClick={() => void act('add')}>{delta < 0 ? <Minus size={16} /> : <Plus size={16} />} Anwenden</button>
        </div>{dirty && <p className="cd-hint">Ungespeicherte Änderungen. Speichern oder <button className="cd-text-button" onClick={() => { setDraft(state.profiles[id]); setDirty(false); }}>verwerfen</button>, bevor du das Profil wechselst oder startest.</p>}
      </div>
      <nav className="cd-tabs" aria-label="Countdown-Einstellungen">{tabs.map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <div className="cd-settings">
        {tab === 'time' && <><h2>Zeit & Grenzen</h2><p className="cd-hint">Die Startzeit gilt beim nächsten Start. Änderungen an den Grenzen wirken sofort nach dem Speichern.</p>
          <label>Titel<input value={draft.title} maxLength={120} onChange={e => edit({ title: e.target.value })} /></label>
          <DurationInput label="Startzeit" value={draft.initialSeconds} onChange={initialSeconds => edit({ initialSeconds })} />
          <label>Zeitbegrenzung<select value={draft.limit} onChange={e => edit({ limit: e.target.value as CountdownProfile['limit'] })}><option value="none">Unbegrenzt verlängern</option><option value="remaining">Maximale Restzeit</option><option value="deadline">Fester Endzeitpunkt</option></select></label>
          {draft.limit === 'remaining' && <DurationInput label="Höchstens auf der Uhr" value={draft.maxSeconds} onChange={maxSeconds => edit({ maxSeconds })} />}
          {draft.limit === 'deadline' && <label>Spätestes Ende (Ortszeit)<input type="datetime-local" value={draft.deadline ? new Date(draft.deadline - new Date(draft.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => edit({ deadline: new Date(e.target.value).getTime() || 0 })} /></label>}
          <p className="cd-hint">Pausiert: Zeit bleibt stehen, Boni werden weiter gesammelt. Ein fester Endzeitpunkt bleibt auch während einer Pause verbindlich. Nach einem Neustart läuft ein aktiver Countdown mit der tatsächlich vergangenen Zeit weiter.</p>
        </>}
        {tab === 'bonuses' && <><h2>Zeitboni</h2><p className="cd-hint">Nur laufende und pausierte Profile sammeln Zeit. Bereits beendete Timer starten durch Ereignisse nicht erneut.</p>
          <div className="cd-rule"><Toggle label="Abonnements" checked={draft.bonuses.subsEnabled} onChange={subsEnabled => bonus({ subsEnabled })} /><Toggle label="Geschenk-Abos (pro Abo)" checked={draft.bonuses.giftsEnabled} onChange={giftsEnabled => bonus({ giftsEnabled })} />
            <div className="cd-three">{(['tier1', 'tier2', 'tier3'] as const).map((key, i) => <DurationInput key={key} label={`Tier ${i + 1}${i === 0 ? ' / Prime' : ''}`} value={draft.bonuses[key]} onChange={seconds => bonus({ [key]: seconds })} />)}</div></div>
          <div className="cd-rule"><Toggle label="Bits" checked={draft.bonuses.bitsEnabled} onChange={bitsEnabled => bonus({ bitsEnabled })} /><DurationInput label="Zeit pro 100 Bits (anteilig)" value={draft.bonuses.bitsPer100} onChange={bitsPer100 => bonus({ bitsPer100 })} /></div>
          <div className="cd-rule"><Toggle label="Spenden" checked={draft.bonuses.tipsEnabled} onChange={tipsEnabled => bonus({ tipsEnabled })} />
            <RuleMap title="Zeit pro 1 Währungseinheit (z. B. EUR)" values={draft.bonuses.currencies} onChange={currencies => bonus({ currencies })} currency />
            <p className="cd-hint">2,50 EUR bei 60 Sekunden/EUR ergeben 2:30 Minuten. Währungen ohne Regel geben keinen Bonus; es findet keine Wechselkursumrechnung statt.</p></div>
          <div className="cd-rule"><RewardRules values={draft.bonuses.rewards} onChange={rewards => bonus({ rewards })} /></div>
        </>}
        {tab === 'finish' && <><h2>Wenn die Zeit abläuft</h2><p className="cd-hint">Abschlussaktionen werden pro Lauf einmal ausgelöst. Ein Folgeprofil startet nur, wenn es nicht bereits läuft oder pausiert ist.</p>
          <Toggle label="Abschluss-Sound" checked={draft.finish.soundEnabled} onChange={soundEnabled => finish({ soundEnabled })} />
          <label>Eigener Sound (optional; sonst Signalton)<input type="file" accept="audio/*" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 12 * 1024 * 1024) { setError('Sound darf maximal 12 MB groß sein.'); return; }
            const reader = new FileReader(); reader.onload = () => { void request<{ url: string }>('/api/overlay/assets', { kind: 'alert-sound', dataUrl: reader.result }).then(result => finish({ soundUrl: result.url })).catch(e => setError(e.message)); }; reader.readAsDataURL(file);
          }} /></label>{draft.finish.soundUrl && <div className="cd-uploaded"><audio controls src={draft.finish.soundUrl} /><button onClick={() => finish({ soundUrl: '' })}>Standardton verwenden</button></div>}
          <Toggle label="Abschluss-Alert im Countdown-Overlay" checked={draft.finish.alertEnabled} onChange={alertEnabled => finish({ alertEnabled })} /><label>Alert-Text<input maxLength={200} value={draft.finish.text} onChange={e => finish({ text: e.target.value })} /></label>
          <Toggle label="Nachricht im Twitch-Chat" checked={draft.finish.chatEnabled} onChange={chatEnabled => finish({ chatEnabled })} /><label>Chatnachricht<input maxLength={350} value={draft.finish.chatMessage} onChange={e => finish({ chatMessage: e.target.value })} /></label>
          <Toggle label="Overlay anschließend ausblenden" checked={draft.finish.hideEnabled} onChange={hideEnabled => finish({ hideEnabled })} /><label>Ausblenden nach (Sekunden)<input type="number" min="0" max="3600" value={draft.finish.hideAfterSeconds} onChange={e => finish({ hideAfterSeconds: Number(e.target.value) })} /></label>
          <label>Danach nächstes Profil starten<select value={draft.finish.next} onChange={e => finish({ next: e.target.value as CountdownId | '' })}><option value="">Kein Folgeprofil</option>{COUNTDOWN_IDS.filter(next => next !== id).map(next => <option key={next} value={next}>{next === 'streamstart' ? 'Streamstart' : 'Subathon'}</option>)}</select></label>
          <p className="cd-hint">Für Sound und Alert die eigene Countdown-OBS-Quelle verwenden und in OBS Audio aktivieren. Ein Folgeprofil hat einen eigenen OBS-Link; beide Quellen können in derselben Szene liegen.</p>
        </>}
        {tab === 'look' && <><h2>Darstellung</h2><div className="cd-three"><label>Textfarbe<input type="color" value={draft.look.color} onChange={e => look({ color: e.target.value })} /></label><label>Hintergrund<input type="color" value={draft.look.background.slice(0, 7)} onChange={e => look({ background: e.target.value })} /></label><Toggle label="Transparent" checked={draft.look.background.endsWith('00')} onChange={transparent => look({ background: draft.look.background.slice(0, 7) + (transparent ? '00' : 'ff') })} /></div>
          <AlertFontField language="de" family={draft.look.font} fonts={draft.look.fonts || []} onFamily={font => look({ font })} onLibrary={(fonts, font) => look({ fonts, font })} />
          <p className="cd-hint">Eigene Schrift im Schriftmenü hochladen (TTF, OTF, WOFF oder WOFF2, maximal 12 MB). Anschließend speichern, damit sie auch in OBS verwendet wird.</p>
          <label>Schriftgröße (Pixel)<input type="number" min="16" max="400" value={draft.look.fontSize} onChange={e => look({ fontSize: Number(e.target.value) })} /></label>
          <Toggle label="Letzten Zeitbonus kurz einblenden" checked={draft.look.showBonus} onChange={showBonus => look({ showBonus })} /><Toggle label="Insgesamt hinzugefügte Zeit anzeigen" checked={draft.look.showTotal} onChange={showTotal => look({ showTotal })} />
        </>}
        {tab === 'connections' && <DonationConnections onError={setError} />}
      </div>
      <div className="cd-link-card"><div><Link2 size={19} /><strong>OBS-Browserquelle · {id === 'streamstart' ? 'Streamstart' : 'Subathon'}</strong></div><p className="cd-hint">Empfohlen: 1000 × 360 Pixel. Bis zum Start bleibt die Quelle unsichtbar. Den Link wie einen privaten Overlay-Schlüssel behandeln.</p>
        <div className="cd-link"><input aria-label="Countdown OBS-URL" readOnly value={token ? overlayUrl : 'OBS-Link wird geladen …'} /><button disabled={!token} onClick={() => { void navigator.clipboard.writeText(overlayUrl).then(() => setNotice('OBS-Link kopiert')).catch(() => setError('Link bitte aus dem Feld kopieren.')); }}>Kopieren</button></div>
      </div>
    </div></div>
  </section>;
}

function RuleMap({ title, values, onChange, currency = false }: { title: string; values: Record<string, number>; onChange: (values: Record<string, number>) => void; currency?: boolean }) {
  const [key, setKey] = useState('');
  return <div className="cd-rule-map"><h3>{title}</h3>{Object.entries(values).map(([id, seconds]) => <div className="cd-rule-row" key={id}><code>{id}</code><DurationInput label="Zeitbonus" value={seconds} onChange={value => onChange({ ...values, [id]: value })} /><button aria-label={`Regel ${id} entfernen`} onClick={() => onChange(Object.fromEntries(Object.entries(values).filter(([name]) => name !== id)))}>Entfernen</button></div>)}
    <div className="cd-rule-add"><input aria-label={currency ? 'Neue Währung' : 'Neue Reward-ID'} placeholder={currency ? 'EUR' : 'Reward-ID'} value={key} maxLength={currency ? 3 : 100} onChange={e => setKey(currency ? e.target.value.toUpperCase() : e.target.value)} /><button disabled={!key || Object.keys(values).length >= 50} onClick={() => { onChange({ ...values, [key]: values[key] ?? 60 }); setKey(''); }}><Plus size={15} /> Regel</button></div>
  </div>;
}
function RewardRules({ values, onChange }: { values: Record<string, number>; onChange: (values: Record<string, number>) => void }) {
  const [rewards, setRewards] = useState<Array<{ id: string; title: string; cost: number }>>([]);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  return <><h3>Kanalpunkte-Belohnungen</h3><button disabled={busy} onClick={() => {
    setBusy(true); setMessage('');
    void request<{ rewards: Array<{ id: string; title: string; cost: number }> }>('/api/twitch/channel-point-rewards').then(data => setRewards(data.rewards || [])).catch(error => setMessage(error.message)).finally(() => setBusy(false));
  }}>{busy ? 'Wird geladen …' : 'Belohnungen von Twitch laden'}</button>
    {rewards.length > 0 && <label>Belohnung hinzufügen<select value="" onChange={e => { if (e.target.value) onChange({ ...values, [e.target.value]: values[e.target.value] ?? 60 }); }}><option value="">Belohnung auswählen …</option>{rewards.map(reward => <option key={reward.id} value={reward.id} disabled={Object.keys(values).length >= 50}>{reward.title} · {reward.cost} Punkte</option>)}</select></label>}
    {message && <p role="status" className="cd-hint">{message}</p>}
    <RuleMap title="Zeit pro Einlösung (alternativ Reward-ID eingeben)" values={values} onChange={onChange} />
    <p className="cd-hint">Die Twitch-Anmeldung benötigt Zugriff auf Kanalpunkte-Einlösungen. Bereits konfigurierte Regeln bleiben auch bei einer getrennten Twitch-Verbindung erhalten.</p>
  </>;
}
function DonationConnections({ onError }: { onError: (error: string) => void }) {
  const [connections, setConnections] = useState<Record<DonationProvider, DonationStatus> | null>(null);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const data = await request<Record<DonationProvider, DonationStatus>>('/api/countdowns/connections'); if (active) setConnections(data); }
      catch (e) { if (active) onError((e as Error).message); }
      if (active) timer = setTimeout(poll, 4000);
    };
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, [onError]);
  return <><h2>Spendenanbieter</h2><p className="cd-hint">Verbindungen gelten für beide Profile. Tokens bleiben verschlüsselt auf diesem Rechner. Subs und Bits kommen ausschließlich von Twitch. Für dieselbe Spendenquelle nur einen Anbieter aktivieren, damit gespiegelte Zahlungen nicht doppelt zählen.</p>
    {connections ? DONATION_PROVIDERS.map(provider => <DonationConnection key={provider} provider={provider} value={connections[provider]} onSave={setConnections} onError={onError} />) : <p>Verbindungen werden geladen …</p>}</>;
}
function DonationConnection({ provider, value, onSave, onError }: { provider: DonationProvider; value: DonationStatus; onSave: (data: Record<DonationProvider, DonationStatus>) => void; onError: (error: string) => void }) {
  const [settings, setSettings] = useState({ enabled: value.enabled, channel: value.channel, username: value.username, token: '' });
  const [busy, setBusy] = useState(false);
  const status = value;
  return <div className="cd-rule"><div className="cd-provider-head"><h3>{PROVIDERS[provider]}</h3><span className={`cd-status ${status.state}`}>{({ off: 'Aus', connecting: 'Verbindet …', connected: 'Verbunden', error: 'Verbindung prüfen' })[status.state]}</span></div>
    <Toggle label="Verbindung aktivieren" checked={settings.enabled} onChange={enabled => setSettings({ ...settings, enabled })} />
    <label>{provider === 'streamelements' ? 'JWT-Token' : provider === 'streamlabs' ? 'Socket API Token' : 'API Key'}<input type="password" autoComplete="new-password" value={settings.token} placeholder={value.configured ? 'Gespeichert — leer lassen zum Beibehalten' : 'Token eingeben'} onChange={e => setSettings({ ...settings, token: e.target.value })} /></label>
    {provider === 'streamelements' && <label>Channel-ID<input value={settings.channel} onChange={e => setSettings({ ...settings, channel: e.target.value.trim() })} /></label>}
    {provider === 'tipeeestream' && <label>Benutzername<input value={settings.username} onChange={e => setSettings({ ...settings, username: e.target.value.trim() })} /></label>}
    <p className="cd-hint">{provider === 'streamelements' ? 'Im StreamElements-Dashboard den Twitch-Kanal wählen und JWT sowie Channel-ID kopieren.' : provider === 'streamlabs' ? 'Streamlabs → Einstellungen → API Settings → Socket API Token. Kein OAuth-Zugriffstoken.' : 'API Key aus deinem TipeeeStream-Konto verwenden.'}</p>
    {status.message && <p role="status" className="cd-hint">{status.message}</p>}
    <button disabled={busy} onClick={() => { setBusy(true); void request<Record<DonationProvider, DonationStatus>>(`/api/countdowns/connections/${provider}`, settings).then(data => { onSave(data); setSettings(current => ({ ...current, token: '' })); onError(''); }).catch(e => onError(e.message)).finally(() => setBusy(false)); }}><Save size={16} /> Verbindung speichern</button>
  </div>;
}
