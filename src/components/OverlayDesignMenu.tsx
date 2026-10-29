import { useState, type ReactNode } from 'react';
import { BASIC_CHAT_MOTIONS, CHAT_ROLE_FILTERS, CREATIVE_CHAT_MOTIONS, type ChatMotion, type ChatStyle, type OverlayChatOptions } from '../overlayChat.ts';
import {
  OVERLAY_ANIMATIONS, OVERLAY_ARTWORK_SHAPES, OVERLAY_LAYOUTS, OVERLAY_POP_ANIMATIONS, OVERLAY_POP_POSITIONS, OVERLAY_POP_STYLES, OVERLAY_PROGRESS_STYLES, OVERLAY_TEXT_ALIGNS, OVERLAY_THEMES, QUEUE_POP_PRESETS,
  type OverlayAnimation, type OverlayArtworkShape, type OverlayLayout, type OverlayOptions, type OverlayPopAnimation, type OverlayPopPosition, type OverlayPopStyle, type OverlayProgressStyle, type OverlayTextAlign, type OverlayTheme
} from '../overlayOptions.ts';
import type { AlertFontAsset } from '../alertBox.ts';
import { AlertFontField } from './alert-creator/AlertFontField.tsx';
import { apiFetch } from '../apiClient.ts';

const THEME_COLORS: Record<OverlayTheme, string> = {
  glass: 'linear-gradient(135deg,#09090b,#52525b)',
  neon: 'linear-gradient(135deg,#4a044e,#d946ef)',
  minimal: 'linear-gradient(135deg,#000,#27272a)',
  light: 'linear-gradient(135deg,#fff,#d4d4d8)',
  ocean: 'linear-gradient(135deg,#082f49,#22d3ee)',
  sunset: 'linear-gradient(135deg,#881337,#fb923c)',
  twitch: 'linear-gradient(135deg,#120c25,#9147ff)',
  mono: 'linear-gradient(135deg,#fff 50%,#000 50%)'
};

const PLAYER_SECTIONS = ['look', 'content', 'type', 'popup', 'css'] as const;
const CHAT_SECTIONS = ['look', 'filter', 'css'] as const;
type DesignSection = typeof PLAYER_SECTIONS[number] | typeof CHAT_SECTIONS[number];

interface OverlayDesignMenuProps {
  options: OverlayOptions;
  language: 'de' | 'en';
  target: 'music-player' | 'twitch-chat';
  widgetCss: string;
  fontSize: number;
  onFontSize: (fontSize: number, history: boolean) => void;
  onEdit: (recipe: (current: OverlayOptions) => OverlayOptions, history: boolean) => void;
  onArm: () => void;
  onRelease: () => void;
  onWidgetCss: (css: string, history: boolean) => void;
}

export function OverlayDesignMenu(props: OverlayDesignMenuProps) {
  const { options, language, target, widgetCss, fontSize, onFontSize, onEdit, onArm, onRelease, onWidgetCss } = props;
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const sections = target === 'music-player' ? PLAYER_SECTIONS : CHAT_SECTIONS;
  const [section, setSection] = useState<DesignSection>('look');
  const active = sections.includes(section as never) ? section : 'look';
  const set = <K extends keyof OverlayOptions>(key: K, value: OverlayOptions[K], history = true) => onEdit(current => ({ ...current, [key]: value }), history);
  const setChat = (patch: Partial<OverlayChatOptions>, history = true) => onEdit(current => ({ ...current, chat: { ...current.chat, ...patch } }), history);
  const saveFonts = (fonts: AlertFontAsset[], family: string, apply: 'player' | 'chat') => onEdit(current => ({
    ...current,
    fontFamily: apply === 'player' ? family : current.fontFamily,
    alertBox: { ...current.alertBox, fonts },
    chat: apply === 'chat' ? { ...current.chat, fontFamily: family } : current.chat
  }), true);
  const playerFamily = options.fontFamily || (options.fontStyle === 'mono'
    ? 'ui-monospace, monospace'
    : options.fontStyle === 'condensed'
      ? '"Arial Narrow", "Roboto Condensed", sans-serif'
      : options.fontStyle === 'rounded'
        ? 'Segoe UI, sans-serif'
        : 'Inter, sans-serif');

  return (
    <div className="canvas-design">
      <div className="canvas-sections" role="tablist" aria-label={ui('Design', 'Design')}>
        {sections.map(id => (
          <button key={id} type="button" role="tab" aria-selected={active === id} className={active === id ? 'is-active' : ''} onClick={() => setSection(id)}>
            {sectionLabel(id, ui)}
          </button>
        ))}
      </div>
      {target === 'music-player' && active === 'look' && (
        <div className="canvas-panel">
          <div className="canvas-swatches" role="radiogroup" aria-label={ui('Thema', 'Theme')}>
            {OVERLAY_THEMES.map(theme => (
              <button key={theme} type="button" role="radio" aria-checked={options.theme === theme} aria-label={theme} className={options.theme === theme ? 'is-active' : ''} style={{ background: THEME_COLORS[theme] }} onClick={() => set('theme', theme)} />
            ))}
          </div>
          <Field label={ui('Layout', 'Layout')}>
            <select value={options.layout} onChange={event => set('layout', event.target.value as OverlayLayout)}>
              {OVERLAY_LAYOUTS.map(layout => <option key={layout} value={layout}>{layoutLabel(layout, ui)}</option>)}
            </select>
          </Field>
          <Field label={ui('Akzent', 'Accent')}>
            <input type="color" value={options.accent} onChange={event => set('accent', event.target.value)} />
          </Field>
          <Field label={ui('Hintergrundbild', 'Background image')}>
            <input value={options.backgroundImageUrl} onChange={event => set('backgroundImageUrl', event.target.value)} placeholder="https://…" />
            <AssetButton kind="background" language={language} onUploaded={url => set('backgroundImageUrl', url)} />
          </Field>
          <Field label="Logo">
            <input value={options.logoImageUrl} onChange={event => set('logoImageUrl', event.target.value)} placeholder="https://…" />
            <AssetButton kind="logo" language={language} onUploaded={url => onEdit(current => ({ ...current, logoImageUrl: url, showLogo: true }), true)} />
          </Field>
        </div>
      )}
      {target === 'music-player' && active === 'content' && (
        <div className="canvas-panel canvas-checks">
          {([
            ['showArtwork', ui('Cover', 'Artwork')],
            ['showProgress', ui('Fortschritt', 'Progress')],
            ['showRequester', ui('Wunsch', 'Requester')],
            ['showTime', ui('Zeit', 'Time')],
            ['showSource', ui('Quelle', 'Source')],
            ['showRequesterAvatar', ui('Avatar', 'Avatar')],
            ['showRequesterBadge', ui('Badge', 'Badge')],
            ['showBorder', ui('Rahmen', 'Border')],
            ['useMarquee', ui('Laufschrift', 'Marquee')],
            ['hideWhenIdle', ui('Bei Leerlauf aus', 'Hide when idle')],
            ['showLogo', 'Logo']
          ] as Array<[keyof OverlayOptions, string]>).map(([key, label]) => (
            <label key={String(key)}><input type="checkbox" checked={Boolean(options[key])} onChange={event => set(key, event.target.checked as never)} /><span>{label}</span></label>
          ))}
        </div>
      )}
      {target === 'music-player' && active === 'type' && (
        <div className="canvas-panel">
          <AlertFontField
            language={language}
            family={playerFamily}
            fonts={options.alertBox.fonts}
            onFamily={family => set('fontFamily', family)}
            onLibrary={(fonts, family) => saveFonts(fonts, family, 'player')}
          />
          <Range label={ui('Schriftgröße', 'Font size')} min={12} max={32} value={fontSize} onArm={onArm} onRelease={onRelease} onChange={value => onFontSize(value, false)} />
          <Field label={ui('Ausrichtung', 'Alignment')}>
            <select value={options.textAlign} onChange={event => set('textAlign', event.target.value as OverlayTextAlign)}>{OVERLAY_TEXT_ALIGNS.map(id => <option key={id} value={id}>{id === 'left' ? ui('Links', 'Left') : ui('Mitte', 'Center')}</option>)}</select>
          </Field>
          <Field label="Cover">
            <select value={options.artworkShape} onChange={event => set('artworkShape', event.target.value as OverlayArtworkShape)}>{OVERLAY_ARTWORK_SHAPES.map(id => <option key={id} value={id}>{id}</option>)}</select>
          </Field>
          <Field label={ui('Fortschritt', 'Progress')}>
            <select value={options.progressStyle} onChange={event => set('progressStyle', event.target.value as OverlayProgressStyle)}>{OVERLAY_PROGRESS_STYLES.map(id => <option key={id} value={id}>{id}</option>)}</select>
          </Field>
          <Field label={ui('Animation', 'Animation')}>
            <select value={options.animation} onChange={event => set('animation', event.target.value as OverlayAnimation)}>{OVERLAY_ANIMATIONS.map(id => <option key={id} value={id}>{id}</option>)}</select>
          </Field>
          <Range label={ui('Ecken', 'Radius')} min={0} max={40} value={options.radius} onArm={onArm} onRelease={onRelease} onChange={value => set('radius', value, false)} />
          <Range label={ui('Deckkraft', 'Opacity')} min={25} max={100} value={options.backgroundOpacity} onArm={onArm} onRelease={onRelease} onChange={value => set('backgroundOpacity', value, false)} />
          <Range label={ui('Schatten', 'Shadow')} min={0} max={100} value={options.shadowStrength} onArm={onArm} onRelease={onRelease} onChange={value => set('shadowStrength', value, false)} />
          <Range label={ui('Logo', 'Logo')} min={24} max={140} value={options.logoSize} onArm={onArm} onRelease={onRelease} onChange={value => set('logoSize', value, false)} />
        </div>
      )}
      {target === 'music-player' && active === 'popup' && (
        <div className="canvas-panel">
          <label className="canvas-checkline"><input type="checkbox" checked={options.queuePop} onChange={event => set('queuePop', event.target.checked)} /><span>{ui('Popup bei Songwunsch', 'Popup on request')}</span></label>
          {options.queuePop && <>
            <div className="canvas-presets">
              {QUEUE_POP_PRESETS.map(preset => {
                const selected = (Object.keys(preset.values) as Array<keyof typeof preset.values>).every(key => options[key] === preset.values[key]);
                return <button key={preset.id} type="button" className={selected ? 'is-active' : ''} onClick={() => onEdit(current => ({ ...current, ...preset.values }), true)}>{ui(preset.name.de, preset.name.en)}</button>;
              })}
            </div>
            <Range label={ui('Dauer', 'Duration')} min={2} max={10} value={options.queuePopSeconds} onArm={onArm} onRelease={onRelease} onChange={value => set('queuePopSeconds', value, false)} />
            <Field label={ui('Animation', 'Animation')}>
              <select value={options.queuePopAnimation} onChange={event => set('queuePopAnimation', event.target.value as OverlayPopAnimation)}>{OVERLAY_POP_ANIMATIONS.map(id => <option key={id} value={id}>{id}</option>)}</select>
            </Field>
            <Field label={ui('Position', 'Position')}>
              <select value={options.queuePopPosition} onChange={event => set('queuePopPosition', event.target.value as OverlayPopPosition)}>{OVERLAY_POP_POSITIONS.map(id => <option key={id} value={id}>{id}</option>)}</select>
            </Field>
            <Field label={ui('Stil', 'Style')}>
              <select value={options.queuePopStyle} onChange={event => set('queuePopStyle', event.target.value as OverlayPopStyle)}>{OVERLAY_POP_STYLES.map(id => <option key={id} value={id}>{id}</option>)}</select>
            </Field>
            <label className="canvas-checkline"><input type="checkbox" checked={options.queuePopShowArt} onChange={event => set('queuePopShowArt', event.target.checked)} /><span>{ui('Cover im Popup', 'Cover in the popup')}</span></label>
          </>}
        </div>
      )}
      {target === 'twitch-chat' && active === 'look' && (
        <div className="canvas-panel">
          <Field label={ui('Stil', 'Style')}>
            <select value={options.chat.style} onChange={event => setChat({ style: event.target.value as ChatStyle })}>
              {CHAT_STYLE_GROUPS.map(group => (
                <optgroup key={group.en} label={ui(group.de, group.en)}>
                  {group.styles.map(style => <option key={style} value={style}>{styleLabel(style, ui)}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={ui('Bewegung', 'Motion')}>
            <MotionSelect value={options.chat.motion} ui={ui} onChange={motion => setChat({ motion })} />
          </Field>
          <Field label={ui('Ausblendung', 'Fade out')}>
            <MotionSelect value={options.chat.exitMotion} ui={ui} onChange={exitMotion => setChat({ exitMotion })} />
          </Field>
          <AlertFontField
            language={language}
            family={options.chat.fontFamily || 'Inter, sans-serif'}
            fonts={options.alertBox.fonts}
            onFamily={family => setChat({ fontFamily: family })}
            onLibrary={(fonts, family) => saveFonts(fonts, family, 'chat')}
          />
          <Range label={ui('Schriftgröße', 'Font size')} min={12} max={32} value={options.chat.fontSize} onArm={onArm} onRelease={onRelease} onChange={value => setChat({ fontSize: value }, false)} />
          <Range label={ui('Lebensdauer', 'Lifetime')} min={0} max={180} value={options.chat.lifetimeSeconds} onArm={onArm} onRelease={onRelease} onChange={value => setChat({ lifetimeSeconds: value }, false)} />
          <Range label="Fade" min={0} max={1000} value={options.chat.fadeMs} onArm={onArm} onRelease={onRelease} onChange={value => setChat({ fadeMs: value }, false)} />
          <Range label={ui('Deckkraft', 'Opacity')} min={0} max={100} value={options.chat.opacity} onArm={onArm} onRelease={onRelease} onChange={value => setChat({ opacity: value }, false)} />
          <Range label={ui('Zeilen', 'Lines')} min={4} max={50} value={options.chat.maxLines} onArm={onArm} onRelease={onRelease} onChange={value => setChat({ maxLines: value }, false)} />
          <div className="canvas-checks">
            <label><input type="checkbox" checked={options.chat.showBadges} onChange={event => setChat({ showBadges: event.target.checked })} /><span>Badges</span></label>
            <label><input type="checkbox" checked={options.chat.showTimestamps} onChange={event => setChat({ showTimestamps: event.target.checked })} /><span>{ui('Uhrzeit', 'Time')}</span></label>
            <label><input type="checkbox" checked={options.chat.showNameColors} onChange={event => setChat({ showNameColors: event.target.checked })} /><span>{ui('Namensfarben', 'Name colours')}</span></label>
            <label><input type="checkbox" checked={options.chat.showBackground} onChange={event => setChat({ showBackground: event.target.checked })} /><span>{ui('Hintergrund', 'Background')}</span></label>
            <label><input type="checkbox" checked={options.chat.showEmotes} onChange={event => setChat({ showEmotes: event.target.checked })} /><span>Emotes</span></label>
            <label><input type="checkbox" checked={options.chat.showOutline} onChange={event => setChat({ showOutline: event.target.checked })} /><span>{ui('Kontur', 'Outline')}</span></label>
            <label><input type="checkbox" checked={options.chat.showReplies} onChange={event => setChat({ showReplies: event.target.checked })} /><span>{ui('Antworten', 'Replies')}</span></label>
            <label><input type="checkbox" checked={options.chat.highlightMentions} onChange={event => setChat({ highlightMentions: event.target.checked })} /><span>{ui('Erwähnungen', 'Mentions')}</span></label>
          </div>
          <Field label={ui('Namen', 'Names')}><input type="color" value={options.chat.nameColor} onChange={event => setChat({ nameColor: event.target.value })} /></Field>
          <Field label={ui('Text', 'Text')}><input type="color" value={options.chat.messageColor} onChange={event => setChat({ messageColor: event.target.value })} /></Field>
          <Field label={ui('Hintergrund', 'Background')}><input type="color" value={options.chat.background} onChange={event => setChat({ background: event.target.value })} /></Field>
        </div>
      )}
      {target === 'twitch-chat' && active === 'filter' && (
        <div className="canvas-panel">
          <label className="canvas-checkline"><input type="checkbox" checked={options.chat.hideCommands} onChange={event => setChat({ hideCommands: event.target.checked })} /><span>{ui('Befehle ausblenden', 'Hide commands')}</span></label>
          <Field label={ui('Wer erscheint', 'Who appears')}>
            <select value={options.chat.roleFilter} onChange={event => setChat({ roleFilter: event.target.value as OverlayChatOptions['roleFilter'] })}>
              {CHAT_ROLE_FILTERS.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </Field>
          <Field label={ui('Blockierte Wörter', 'Blocked words')}>
            <textarea value={options.chat.blockWords.join('\n')} onChange={event => setChat({ blockWords: lines(event.target.value) }, false)} onFocus={onArm} onBlur={onRelease} />
          </Field>
          <Field label={ui('Blockierte Nutzer', 'Blocked users')}>
            <textarea value={options.chat.blockUsers.join('\n')} onChange={event => setChat({ blockUsers: lines(event.target.value) }, false)} onFocus={onArm} onBlur={onRelease} />
          </Field>
        </div>
      )}
      {active === 'css' && (
        <div className="canvas-panel">
          <Field label="CSS">
            <textarea
              maxLength={target === 'music-player' ? 6000 : 2000}
              value={target === 'music-player' ? options.customCss : widgetCss}
              onChange={event => target === 'music-player' ? set('customCss', event.target.value, false) : onWidgetCss(event.target.value, false)}
              onFocus={onArm}
              onBlur={onRelease}
              placeholder={target === 'music-player' ? '#obs-now-playing-banner {}' : '.overlay-chat {}'}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

const CHAT_STYLE_GROUPS: { de: string; en: string; styles: ChatStyle[] }[] = [
  { de: 'Basis', en: 'Basic', styles: ['classic', 'bubbles', 'stacked', 'inline', 'messenger', 'nametag'] },
  { de: 'Retro', en: 'Retro', styles: ['terminal', 'bevel', 'handheld', 'arcade', 'y2k', 'receipt'] },
  { de: 'Neon', en: 'Neon', styles: ['neon', 'vapor', 'hud', 'gothic', 'gem'] },
  { de: 'Papier', en: 'Paper', styles: ['brutal', 'comic', 'note', 'sakura'] }
];

const CHAT_STYLE_LABELS: Record<ChatStyle, { de: string; en: string }> = {
  classic: { de: 'Zeile', en: 'Line' },
  bubbles: { de: 'Blasen', en: 'Bubbles' },
  stacked: { de: 'Zweizeilig', en: 'Stacked' },
  inline: { de: 'Kompakt', en: 'Inline' },
  messenger: { de: 'Messenger', en: 'Messenger' },
  nametag: { de: 'Namensschild', en: 'Nametag' },
  terminal: { de: 'Terminal', en: 'Terminal' },
  bevel: { de: 'Fenster', en: 'Window' },
  handheld: { de: 'Handheld', en: 'Handheld' },
  arcade: { de: 'Arcade', en: 'Arcade' },
  y2k: { de: 'Y2K', en: 'Y2K' },
  receipt: { de: 'Kassenbon', en: 'Receipt' },
  neon: { de: 'Neon', en: 'Neon' },
  vapor: { de: 'Vapor', en: 'Vapor' },
  hud: { de: 'HUD', en: 'HUD' },
  gothic: { de: 'Gothic', en: 'Gothic' },
  gem: { de: 'Gold', en: 'Gold' },
  brutal: { de: 'Brutal', en: 'Brutal' },
  comic: { de: 'Comic', en: 'Comic' },
  note: { de: 'Notiz', en: 'Note' },
  sakura: { de: 'Sakura', en: 'Sakura' }
};

function styleLabel(style: ChatStyle, ui: (de: string, en: string) => string) {
  const label = CHAT_STYLE_LABELS[style];
  return ui(label.de, label.en);
}

function MotionSelect({ value, ui, onChange }: { value: ChatMotion; ui: (de: string, en: string) => string; onChange: (motion: ChatMotion) => void }) {
  return (
    <select value={value} onChange={event => onChange(event.target.value as ChatMotion)}>
      <optgroup label={ui('Basis', 'Basic')}>
        {BASIC_CHAT_MOTIONS.map(motion => <option key={motion} value={motion}>{motionLabel(motion, ui)}</option>)}
      </optgroup>
      <optgroup label={ui('Kreativ', 'Creative')}>
        {CREATIVE_CHAT_MOTIONS.map(motion => <option key={motion} value={motion}>{motionLabel(motion, ui)}</option>)}
      </optgroup>
    </select>
  );
}

function motionLabel(motion: ChatMotion, ui: (de: string, en: string) => string) {
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
  return ui(...labels[motion]);
}

function sectionLabel(id: DesignSection, ui: (de: string, en: string) => string) {
  if (id === 'look') return ui('Look', 'Look');
  if (id === 'content') return ui('Inhalt', 'Content');
  if (id === 'type') return ui('Typo', 'Type');
  if (id === 'popup') return 'Popup';
  if (id === 'filter') return 'Filter';
  return 'CSS';
}

function layoutLabel(layout: OverlayLayout, ui: (de: string, en: string) => string) {
  const labels: Record<OverlayLayout, [string, string]> = {
    horizontal: ['Horizontal', 'Horizontal'], compact: ['Kompakt', 'Compact'], stacked: ['Gestapelt', 'Stacked'],
    banner: ['Banner', 'Banner'], vertical: ['Vertikal', 'Vertical'], spotlight: ['Spotlight', 'Spotlight'],
    textOnly: ['Nur Text', 'Text only'], coverCard: ['Cover-Karte', 'Cover card']
  };
  return ui(...labels[layout]);
}

function lines(value: string) {
  return value.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="canvas-field"><span>{label}</span>{children}</label>;
}

function Range({ label, min, max, value, onChange, onArm, onRelease }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void; onArm: () => void; onRelease: () => void }) {
  return (
    <label className="canvas-field">
      <span>{label} <output>{value}</output></span>
      <input type="range" min={min} max={max} value={value} onPointerDown={onArm} onPointerUp={onRelease} onChange={event => onChange(Number(event.target.value))} />
    </label>
  );
}

function AssetButton({ kind, language, onUploaded }: { kind: 'background' | 'logo'; language: 'de' | 'en'; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  return (
    <label className="canvas-upload">
      {busy ? ui('Speichert…', 'Saving…') : ui('Hochladen', 'Upload')}
      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => {
        const file = event.target.files?.[0];
        event.currentTarget.value = '';
        if (!file || file.size > 1024 * 1024) return;
        setBusy(true);
        const reader = new FileReader();
        reader.onload = () => {
          void apiFetch('/api/v1/overlay/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, dataUrl: String(reader.result) }) })
            .then(response => response.json())
            .then(json => { if (json.url) onUploaded(String(json.url)); })
            .finally(() => setBusy(false));
        };
        reader.onerror = () => setBusy(false);
        reader.readAsDataURL(file);
      }} />
    </label>
  );
}
