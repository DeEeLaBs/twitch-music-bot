import type { OverlayChatOptions } from '../overlayChat.ts';
import { BASIC_CHAT_MOTIONS, CHAT_ROLE_FILTERS, CREATIVE_CHAT_MOTIONS, type ChatMotion } from '../overlayChat.ts';
import { sampleChatLine } from '../overlayChat.ts';

interface OverlayChatFieldsProps {
  chat: OverlayChatOptions;
  language?: 'de' | 'en';
  onChange: (chat: OverlayChatOptions) => void;
}

export function OverlayChatFields({ chat, language = 'de', onChange }: OverlayChatFieldsProps) {
  const de = language === 'de';
  const set = <K extends keyof OverlayChatOptions>(key: K, value: OverlayChatOptions[K]) => onChange({ ...chat, [key]: value });
  const burst = () => {
    const now = Date.now();
    const samples = [
      sampleChatLine({ id: `burst-${now}-1`, text: 'Chat preview from the studio.', displayName: 'OverlayFan', login: 'overlayfan', badge: 'vip', color: '#c084fc', ts: now }),
      sampleChatLine({ id: `burst-${now}-2`, text: '!sr hidden command', displayName: 'Viewer', login: 'viewer', badge: 'viewer', ts: now + 1 }),
      sampleChatLine({ id: `burst-${now}-3`, text: 'Mods keep their badge.', displayName: 'Mod', login: 'mod', badge: 'moderator', color: '#34d399', ts: now + 2 })
    ];
    for (const line of samples) window.dispatchEvent(new CustomEvent('overlay:chat-sample', { detail: line }));
  };
  return (
    <fieldset className="control-group">
      <legend>{de ? 'Twitch-Chat' : 'Twitch chat'}</legend>
      <label className="switch-row">
        <span>{de ? 'Chat im Overlay anzeigen' : 'Show chat on the overlay'}</span>
        <input type="checkbox" checked={chat.enabled} onChange={event => set('enabled', event.target.checked)} />
        <span className="switch" />
      </label>
      {chat.enabled && <>
        <div className="toggle-grid">
          <Switch label={de ? 'Badges' : 'Badges'} checked={chat.showBadges} onChange={value => set('showBadges', value)} />
          <Switch label={de ? 'Uhrzeit' : 'Timestamps'} checked={chat.showTimestamps} onChange={value => set('showTimestamps', value)} />
          <Switch label={de ? 'Namensfarben' : 'Name colours'} checked={chat.showNameColors} onChange={value => set('showNameColors', value)} />
          <Switch label={de ? 'Zeilenhintergrund' : 'Line background'} checked={chat.showBackground} onChange={value => set('showBackground', value)} />
          <Switch label={de ? 'Befehle ausblenden' : 'Hide commands'} checked={chat.hideCommands} onChange={value => set('hideCommands', value)} />
        </div>
        <div className="select-grid">
          <label>
            <span>{de ? 'Bewegung' : 'Motion'}</span>
            <MotionSelect value={chat.motion} de={de} onChange={motion => set('motion', motion)} />
          </label>
          <label>
            <span>{de ? 'Ausblendung' : 'Fade out'}</span>
            <MotionSelect value={chat.exitMotion} de={de} onChange={exitMotion => set('exitMotion', exitMotion)} />
          </label>
          <label>
            <span>{de ? 'Wer erscheint' : 'Who appears'}</span>
            <select value={chat.roleFilter} onChange={event => set('roleFilter', event.target.value as OverlayChatOptions['roleFilter'])}>
              {CHAT_ROLE_FILTERS.map(role => <option key={role} value={role}>{roleLabel(role, de)}</option>)}
            </select>
          </label>
        </div>
        <div className="range-grid range-grid-wide">
          <Range label={de ? 'Schrift' : 'Font'} value={chat.fontSize} min={12} max={32} step={1} suffix="px" onChange={value => set('fontSize', value)} />
          <Range label={de ? 'Zeilen' : 'Lines'} value={chat.maxLines} min={4} max={50} step={1} onChange={value => set('maxLines', value)} />
          <Range label={de ? 'Lebensdauer' : 'Lifetime'} value={chat.lifetimeSeconds} min={0} max={180} step={5} suffix="s" onChange={value => set('lifetimeSeconds', value)} />
          <Range label="Fade" value={chat.fadeMs} min={0} max={1000} step={20} suffix="ms" onChange={value => set('fadeMs', value)} />
          <Range label={de ? 'Deckkraft' : 'Opacity'} value={chat.opacity} min={0} max={100} step={5} suffix="%" onChange={value => set('opacity', value)} />
          <Range label={de ? 'Breite' : 'Width'} value={chat.width} min={12} max={80} step={1} suffix="%" onChange={value => set('width', value)} />
          <Range label={de ? 'Höhe' : 'Height'} value={chat.height} min={12} max={90} step={1} suffix="%" onChange={value => set('height', value)} />
        </div>
        <div className="select-grid">
          <Color label={de ? 'Namen' : 'Names'} value={chat.nameColor} onChange={value => set('nameColor', value)} />
          <Color label={de ? 'Text' : 'Text'} value={chat.messageColor} onChange={value => set('messageColor', value)} />
          <Color label={de ? 'Hintergrund' : 'Background'} value={chat.background} onChange={value => set('background', value)} />
        </div>
        <label>
          <span>{de ? 'Blockierte Wörter, Komma oder Zeile' : 'Blocked words, comma or line'}</span>
          <textarea className="custom-css-input" value={chat.blockWords.join('\n')} onChange={event => set('blockWords', event.target.value.split(/[,\n]/).map(item => item.trim()).filter(Boolean) as unknown as OverlayChatOptions['blockWords'])} />
        </label>
        <label>
          <span>{de ? 'Blockierte Nutzer' : 'Blocked users'}</span>
          <textarea className="custom-css-input" value={chat.blockUsers.join('\n')} onChange={event => set('blockUsers', event.target.value.split(/[,\n]/).map(item => item.trim()).filter(Boolean) as unknown as OverlayChatOptions['blockUsers'])} />
        </label>
        <button className="secondary-button" type="button" onClick={burst}>{de ? 'Testnachrichten' : 'Test messages'}</button>
        <p className="control-hint">{de ? 'Die OBS-Browserquelle braucht eine große transparente Fläche, zum Beispiel 1280×720. Ziehen ist an, wenn „Elemente verschieben“ aktiv ist. Gelöschte und gesperrte Nachrichten verschwinden von selbst.' : 'The OBS browser source needs a large transparent area, for example 1280×720. Drag works while “Move elements” is on. Deleted and banned messages disappear on their own.'}</p>
      </>}
    </fieldset>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="switch-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span className="switch" /></label>;
}

function Range({ label, value, min, max, step, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label><span>{label} <output>{value}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><div className="color-control"><input type="color" value={value} onChange={event => onChange(event.target.value)} /><output>{value.toUpperCase()}</output></div></label>;
}

function MotionSelect({ value, de, onChange }: { value: ChatMotion; de: boolean; onChange: (motion: ChatMotion) => void }) {
  return (
    <select value={value} onChange={event => onChange(event.target.value as ChatMotion)}>
      <optgroup label={de ? 'Basis' : 'Basic'}>
        {BASIC_CHAT_MOTIONS.map(motion => <option key={motion} value={motion}>{motionLabel(motion, de)}</option>)}
      </optgroup>
      <optgroup label={de ? 'Kreativ' : 'Creative'}>
        {CREATIVE_CHAT_MOTIONS.map(motion => <option key={motion} value={motion}>{motionLabel(motion, de)}</option>)}
      </optgroup>
    </select>
  );
}

function motionLabel(motion: ChatMotion, de: boolean): string {
  const labels: Record<ChatMotion, [string, string]> = {
    none: ['Keine', 'None'],
    fade: ['Einblenden', 'Fade'],
    slide: ['Gleiten', 'Slide'],
    rise: ['Aufsteigen', 'Rise'],
    scale: ['Skalieren', 'Scale'],
    blur: ['Weichzeichnen', 'Blur'],
    wipe: ['Wischen', 'Wipe'],
    drop: ['Fallen', 'Drop'],
    pop: ['Aufploppen', 'Pop'],
    shutter: ['Blende', 'Shutter'],
    tilt: ['Kippen', 'Tilt'],
    squash: ['Stauchen', 'Squash'],
    flash: ['Aufblitzen', 'Flash']
  };
  return de ? labels[motion][0] : labels[motion][1];
}

function roleLabel(role: string, de: boolean): string {
  if (role === 'all') return de ? 'Alle' : 'Everyone';
  if (role === 'subscriber') return de ? 'Abonnenten und höher' : 'Subscribers and up';
  if (role === 'vip') return de ? 'VIPs und höher' : 'VIPs and up';
  return de ? 'Mods und Streamer' : 'Mods and the streamer';
}
