import { useState } from 'react';
import { apiFetch } from '../apiClient.ts';
import { ALERT_ALIGNS, ALERT_INTROS, ALERT_LAYOUTS, ALERT_MEDIA_FITS, ALERT_SOUND_MAX_BYTES, ALERT_TEXT_ANIMS, ALERT_WEIGHTS, alertSoundType, dataUrlWithType, emptyMatch, type AlertAlign, type AlertBoxConfig, type AlertIntro, type AlertLayout, type AlertMediaFit, type AlertTextAnim, type AlertVariation } from '../alertBox.ts';
import { AlertCreatorPanel } from './alert-creator/AlertCreatorPanel.tsx';
import { AlertFontField } from './alert-creator/AlertFontField.tsx';
import type { AlertKind } from '../streamAlerts.ts';

const KINDS: AlertKind[] = ['follow', 'subscription', 'resub', 'gift', 'communitygift', 'cheer', 'raid', 'host', 'tip'];
const SECTIONS = ['layout', 'time', 'type', 'speech', 'variations', 'code'] as const;
const LAYOUT_LABELS: Record<AlertLayout, [string, string]> = {
  'text-over': ['Text über Bild', 'Text over media'],
  'media-left': ['Bild links', 'Media left'],
  'media-top': ['Bild oben', 'Media top']
};
const INTRO_LABELS: Record<AlertIntro, [string, string]> = {
  none: ['Keine', 'None'],
  fade: ['Einblenden', 'Fade'],
  bounce: ['Hüpfen', 'Bounce'],
  slide: ['Gleiten', 'Slide'],
  zoom: ['Zoom', 'Zoom']
};
const TEXT_LABELS: Record<AlertTextAnim, [string, string]> = {
  none: ['Keine', 'None'],
  wiggle: ['Wackeln', 'Wiggle'],
  pulse: ['Puls', 'Pulse'],
  wave: ['Welle', 'Wave']
};
const ALIGN_LABELS: Record<AlertAlign, [string, string]> = {
  left: ['Links', 'Left'],
  center: ['Mitte', 'Center'],
  right: ['Rechts', 'Right']
};
const FIT_LABELS: Record<AlertMediaFit, [string, string]> = {
  contain: ['Einpassen', 'Contain'],
  cover: ['Füllen', 'Cover']
};
const WEIGHT_LABELS: Record<(typeof ALERT_WEIGHTS)[number], [string, string]> = {
  400: ['Normal', 'Regular'],
  600: ['Halbfett', 'Semibold'],
  800: ['Fett', 'Bold'],
  900: ['Schwarz', 'Black']
};

export function AlertBoxMenu({
  config, language, onChange
}: {
  config: AlertBoxConfig;
  language: 'de' | 'en';
  onChange: (next: AlertBoxConfig, history: boolean) => void;
}) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('layout');
  const [notice, setNotice] = useState('');
  const patch = (next: Partial<AlertBoxConfig>, history = true) => onChange({ ...config, ...next }, history);
  const field = (label: string, value: string | number, apply: (value: string) => Partial<AlertBoxConfig>, numeric = false) => (
    <label className="stream-field">
      <span>{label}</span>
      <input value={value} inputMode={numeric ? 'numeric' : 'text'} onChange={event => patch(apply(event.target.value), false)} />
    </label>
  );
  const uploadSound = async (file: File) => {
    const type = alertSoundType(file.name, file.type);
    if (!type) {
      setNotice(ui('Nur MP3, WAV, OGG oder M4A.', 'Only MP3, WAV, OGG or M4A.'));
      return;
    }
    if (file.size > ALERT_SOUND_MAX_BYTES) {
      setNotice(ui('Ton ist größer als 12 MB.', 'Sound is larger than 12 MB.'));
      return;
    }
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const dataUrl = dataUrlWithType(raw, type);
    const response = await apiFetch('/api/v1/overlay/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'alert-sound', dataUrl }) });
    const json = await response.json() as { url?: string; error?: string };
    if (!response.ok || !json.url) {
      setNotice(json.error || ui('Ton konnte nicht gespeichert werden.', 'Sound could not be saved.'));
      return;
    }
    patch({ soundUrl: json.url });
    setNotice(ui('Ton gespeichert.', 'Sound saved.'));
  };
  const weights = ALERT_WEIGHTS.includes(config.fontWeight as (typeof ALERT_WEIGHTS)[number]) ? [...ALERT_WEIGHTS] : [config.fontWeight, ...ALERT_WEIGHTS];
  return (
    <div className="stream-menu">
      <AlertCreatorPanel config={config} language={language} onChange={onChange} />
      <div className="canvas-presets">
        {SECTIONS.map(id => (
          <button key={id} type="button" className={section === id ? 'is-active' : ''} onClick={() => setSection(id)}>
            {{ layout: 'Layout', time: ui('Zeit', 'Time'), type: ui('Schrift', 'Type'), speech: 'TTS', variations: ui('Varianten', 'Variations'), code: 'CSS' }[id]}
          </button>
        ))}
      </div>
      {section === 'layout' && (
        <>
          <label className="stream-field"><span>Layout</span>
            <select value={config.layout} onChange={event => patch({ layout: event.target.value as AlertLayout })}>
              {ALERT_LAYOUTS.map(layout => <option key={layout} value={layout}>{ui(...LAYOUT_LABELS[layout])}</option>)}
            </select>
          </label>
          <label className="stream-field"><span>{ui('Ausrichtung', 'Align')}</span>
            <select value={config.align} onChange={event => patch({ align: event.target.value as AlertAlign })}>
              {ALERT_ALIGNS.map(align => <option key={align} value={align}>{ui(...ALIGN_LABELS[align])}</option>)}
            </select>
          </label>
          <label className="stream-field"><span>{ui('Platte', 'Plate')}</span><input type="color" value={config.plateColor} onChange={event => patch({ plateColor: event.target.value }, false)} /></label>
          <Slider label={ui('Plattendeckkraft', 'Plate opacity')} value={config.plateOpacity} min={0} max={100} suffix="%" onChange={plateOpacity => patch({ plateOpacity }, false)} />
          <Slider label={ui('Ecke', 'Corner')} value={config.radius} min={0} max={48} suffix="px" onChange={radius => patch({ radius }, false)} />
          {field(ui('Vorlage', 'Message'), config.template, value => ({ template: value }))}
          <p className="alert-token-hint">{'{name} {amount} {months} {tier} {viewers} {message}'}</p>
          {field(ui('Medium', 'Media'), config.mediaUrl, value => ({ mediaUrl: value }))}
          {previewable(config.mediaUrl) && (/\.(webm|mp4)(\?|$)/i.test(config.mediaUrl)
            ? <video className="alert-media-preview" src={config.mediaUrl} muted playsInline />
            : <img className="alert-media-preview" src={config.mediaUrl} alt="" />)}
          <label className="stream-field"><span>{ui('Bildpassung', 'Media fit')}</span>
            <select value={config.mediaFit} onChange={event => patch({ mediaFit: event.target.value as AlertMediaFit })}>
              {ALERT_MEDIA_FITS.map(fit => <option key={fit} value={fit}>{ui(...FIT_LABELS[fit])}</option>)}
            </select>
          </label>
          <Slider label={ui('Bildform', 'Media shape')} value={config.mediaRadius} min={0} max={48} suffix="px" onChange={mediaRadius => patch({ mediaRadius }, false)} />
          {field(ui('Ton', 'Alert sound'), config.soundUrl, value => ({ soundUrl: value }))}
          <label className="stream-field"><span>{ui('Tondatei', 'Sound file')}</span><input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a,.webm" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadSound(file); event.currentTarget.value = ''; }} /></label>
          <Slider label={ui('Lautstärke', 'Volume')} value={config.volume} min={0} max={100} suffix="%" onChange={volume => patch({ volume }, false)} />
          <label className="stream-field"><span>Intro</span>
            <select value={config.intro} onChange={event => patch({ intro: event.target.value as AlertIntro })}>
              {ALERT_INTROS.map(intro => <option key={intro} value={intro}>{ui(...INTRO_LABELS[intro])}</option>)}
            </select>
          </label>
          <label className="stream-field"><span>Outro</span>
            <select value={config.outro} onChange={event => patch({ outro: event.target.value as AlertIntro })}>
              {ALERT_INTROS.map(intro => <option key={intro} value={intro}>{ui(...INTRO_LABELS[intro])}</option>)}
            </select>
          </label>
          <label className="stream-field"><span>{ui('Textbewegung', 'Text motion')}</span>
            <select value={config.textAnim} onChange={event => patch({ textAnim: event.target.value as AlertTextAnim })}>
              {ALERT_TEXT_ANIMS.map(anim => <option key={anim} value={anim}>{ui(...TEXT_LABELS[anim])}</option>)}
            </select>
          </label>
          {notice && <p className="alert-token-hint">{notice}</p>}
        </>
      )}
      {section === 'time' && (
        <>
          <Slider label={ui('Dauer', 'Duration')} value={config.durationMs / 1000} min={1} max={30} step={0.1} suffix="s" onChange={seconds => patch({ durationMs: Math.round(seconds * 1000) }, false)} />
          <Slider label={ui('Textverzögerung', 'Text delay')} value={config.textDelayMs / 1000} min={0} max={10} step={0.1} suffix="s" onChange={seconds => patch({ textDelayMs: Math.round(seconds * 1000) }, false)} />
          <Slider label="Intro" value={config.introMs / 1000} min={0} max={4} step={0.1} suffix="s" onChange={seconds => patch({ introMs: Math.round(seconds * 1000) }, false)} />
          <Slider label="Outro" value={config.outroMs / 1000} min={0} max={4} step={0.1} suffix="s" onChange={seconds => patch({ outroMs: Math.round(seconds * 1000) }, false)} />
        </>
      )}
      {section === 'type' && (
        <>
          <AlertFontField
            language={language}
            family={config.fontFamily}
            fonts={config.fonts}
            onFamily={fontFamily => patch({ fontFamily })}
            onLibrary={(fonts, fontFamily) => patch({ fonts, fontFamily })}
          />
          <Slider label={ui('Größe', 'Size')} value={config.fontSize} min={12} max={96} suffix="px" onChange={fontSize => patch({ fontSize }, false)} />
          <label className="stream-field"><span>{ui('Stärke', 'Weight')}</span>
            <select value={String(config.fontWeight)} onChange={event => patch({ fontWeight: Number(event.target.value) })}>
              {weights.map(weight => <option key={weight} value={weight}>{WEIGHT_LABELS[weight as (typeof ALERT_WEIGHTS)[number]] ? ui(...WEIGHT_LABELS[weight as (typeof ALERT_WEIGHTS)[number]]) : String(weight)}</option>)}
            </select>
          </label>
          <label className="stream-field"><span>{ui('Textfarbe', 'Text color')}</span><input type="color" value={config.color} onChange={event => patch({ color: event.target.value }, false)} /></label>
          <label className="stream-field"><span>{ui('Akzent', 'Accent')}</span><input type="color" value={config.accent} onChange={event => patch({ accent: event.target.value }, false)} /></label>
          <label className="stream-field"><span>{ui('Schatten', 'Shadow')}</span><input type="checkbox" checked={config.shadow} onChange={event => patch({ shadow: event.target.checked })} /></label>
          {config.shadow && <Slider label={ui('Schattentiefe', 'Shadow depth')} value={config.shadowStrength} min={0} max={100} onChange={shadowStrength => patch({ shadowStrength }, false)} />}
          <label className="stream-field"><span>{ui('Kontur', 'Stroke')}</span><input type="checkbox" checked={config.stroke} onChange={event => patch({ stroke: event.target.checked })} /></label>
          {config.stroke && <>
            <Slider label={ui('Konturstärke', 'Stroke width')} value={config.strokeWidth} min={0} max={8} suffix="px" onChange={strokeWidth => patch({ strokeWidth }, false)} />
            <label className="stream-field"><span>{ui('Konturfarbe', 'Stroke color')}</span><input type="color" value={config.strokeColor} onChange={event => patch({ strokeColor: event.target.value }, false)} /></label>
          </>}
        </>
      )}
      {section === 'speech' && (
        <>
          <label className="stream-field"><span>TTS</span><input type="checkbox" checked={config.speech.enabled} onChange={event => patch({ speech: { ...config.speech, enabled: event.target.checked } })} /></label>
          {field(ui('Mindestbetrag', 'Minimum amount'), config.speech.minAmount, value => ({ speech: { ...config.speech, minAmount: Number(value) } }), true)}
          {field(ui('Stimme', 'Voice'), config.speech.voice, value => ({ speech: { ...config.speech, voice: value } }))}
          {field('Pitch', config.speech.pitch, value => ({ speech: { ...config.speech, pitch: Number(value) } }), true)}
          <Slider label={ui('Sprachlautstärke', 'Speech volume')} value={config.speech.volume} min={0} max={100} suffix="%" onChange={volume => patch({ speech: { ...config.speech, volume } }, false)} />
          <label className="stream-field"><span>{ui('Aktion ansagen', 'Announce the action')}</span><input type="checkbox" checked={config.speech.announce} onChange={event => patch({ speech: { ...config.speech, announce: event.target.checked } })} /></label>
          {field(ui('Wiederholungslimit', 'Repeat limit'), config.speech.repeatLimit, value => ({ speech: { ...config.speech, repeatLimit: Number(value) } }), true)}
          {field(ui('Blacklist', 'Blacklist'), config.speech.blacklist, value => ({ speech: { ...config.speech, blacklist: value } }))}
          <p className="alert-token-hint">{ui('Die Sprachlautstärke ist getrennt vom Alert-Ton. Bits brauchen den Mindestbetrag.', 'Speech volume is separate from the alert sound. Bits need the minimum amount.')}</p>
        </>
      )}
      {section === 'variations' && (
        <>
          <button type="button" onClick={() => patch({ variations: [...config.variations, variationDraft(config.variations.length)] })}>{ui('Variante', 'Variation')}</button>
          {config.variations.map((variation, index) => (
            <VariationRow key={variation.id} variation={variation} language={language} onChange={next => patch({ variations: config.variations.map((item, itemIndex) => itemIndex === index ? next : item) })} />
          ))}
        </>
      )}
      {section === 'code' && (
        <>
          <label className="stream-field"><span>CSS</span><textarea value={config.customCss} onChange={event => patch({ customCss: event.target.value }, false)} /></label>
          <label className="stream-field"><span>HTML</span><textarea value={config.customHtml} onChange={event => patch({ customHtml: event.target.value }, false)} /></label>
          <p>onWidgetLoad(config) / onEventReceived(event)</p>
        </>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  const shown = Number.isInteger(step) ? Math.round(value) : Math.round(value * 10) / 10;
  return <label className="stream-field"><span>{label} <output>{shown}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

function previewable(value: string): boolean {
  return value.startsWith('/overlay-assets/') || value.startsWith('https://') || value.startsWith('http://');
}

function variationDraft(index: number): AlertVariation {
  return {
    id: `var_${Date.now()}`,
    name: `Variation ${index + 1}`,
    kind: 'cheer',
    enabled: true,
    match: { ...emptyMatch(), minAmount: 100 },
    template: '{name} {amount}',
    mediaUrl: '',
    soundUrl: '',
    volume: 80,
    layout: 'text-over',
    durationMs: 6000,
    textDelayMs: 0,
    introMs: 400,
    outroMs: 400,
    intro: 'fade',
    outro: 'fade',
    textAnim: 'none'
  };
}

function VariationRow({ variation, language, onChange }: { variation: AlertVariation; language: 'de' | 'en'; onChange: (next: AlertVariation) => void }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const setMatch = (patch: Partial<AlertVariation['match']>) => onChange({ ...variation, match: { ...variation.match, ...patch } });
  return (
    <div className="stream-variation">
      <input value={variation.name} onChange={event => onChange({ ...variation, name: event.target.value })} />
      <select value={variation.kind} onChange={event => onChange({ ...variation, kind: event.target.value as AlertKind })}>
        {KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
      </select>
      <input inputMode="numeric" value={variation.match.exactAmount || ''} placeholder="exact" onChange={event => setMatch({ exactAmount: Number(event.target.value) || 0 })} />
      <input inputMode="numeric" value={variation.match.minAmount || ''} placeholder="min" onChange={event => setMatch({ minAmount: Number(event.target.value) || 0 })} />
      <input inputMode="numeric" value={variation.match.maxAmount || ''} placeholder="max" onChange={event => setMatch({ maxAmount: Number(event.target.value) || 0 })} />
      <input inputMode="numeric" value={variation.match.months || ''} placeholder="months" onChange={event => setMatch({ months: Number(event.target.value) || 0 })} />
      <input inputMode="numeric" value={variation.match.minViewers || ''} placeholder="viewers" onChange={event => setMatch({ minViewers: Number(event.target.value) || 0 })} />
      <select value={variation.match.tier} onChange={event => setMatch({ tier: event.target.value as AlertVariation['match']['tier'] })}>
        {['', 'prime', '1000', '2000', '3000'].map(tier => <option key={tier || 'any'} value={tier}>{tier || 'tier'}</option>)}
      </select>
      <details>
        <summary>{ui('Varianten-Look', 'Variation look')}</summary>
        <label className="stream-field"><span>{ui('Vorlage', 'Message')}</span><input value={variation.template} onChange={event => onChange({ ...variation, template: event.target.value })} /></label>
        <p className="alert-token-hint">{'{name} {amount} {months} {tier} {viewers} {message}'}</p>
        <label className="stream-field"><span>Layout</span>
          <select value={variation.layout} onChange={event => onChange({ ...variation, layout: event.target.value as AlertLayout })}>
            {ALERT_LAYOUTS.map(layout => <option key={layout} value={layout}>{ui(...LAYOUT_LABELS[layout])}</option>)}
          </select>
        </label>
        <label className="stream-field"><span>{ui('Medium', 'Media')}</span><input value={variation.mediaUrl} onChange={event => onChange({ ...variation, mediaUrl: event.target.value })} /></label>
        <label className="stream-field"><span>{ui('Ton', 'Alert sound')}</span><input value={variation.soundUrl} onChange={event => onChange({ ...variation, soundUrl: event.target.value })} /></label>
        <Slider label={ui('Lautstärke', 'Volume')} value={variation.volume} min={0} max={100} suffix="%" onChange={volume => onChange({ ...variation, volume })} />
        <label className="stream-field"><span>Intro</span>
          <select value={variation.intro} onChange={event => onChange({ ...variation, intro: event.target.value as AlertIntro })}>
            {ALERT_INTROS.map(intro => <option key={intro} value={intro}>{ui(...INTRO_LABELS[intro])}</option>)}
          </select>
        </label>
        <label className="stream-field"><span>Outro</span>
          <select value={variation.outro} onChange={event => onChange({ ...variation, outro: event.target.value as AlertIntro })}>
            {ALERT_INTROS.map(intro => <option key={intro} value={intro}>{ui(...INTRO_LABELS[intro])}</option>)}
          </select>
        </label>
        <label className="stream-field"><span>{ui('Textbewegung', 'Text motion')}</span>
          <select value={variation.textAnim} onChange={event => onChange({ ...variation, textAnim: event.target.value as AlertTextAnim })}>
            {ALERT_TEXT_ANIMS.map(anim => <option key={anim} value={anim}>{ui(...TEXT_LABELS[anim])}</option>)}
          </select>
        </label>
        <Slider label={ui('Dauer', 'Duration')} value={variation.durationMs / 1000} min={1} max={30} step={0.1} suffix="s" onChange={seconds => onChange({ ...variation, durationMs: Math.round(seconds * 1000) })} />
        <Slider label={ui('Textverzögerung', 'Text delay')} value={variation.textDelayMs / 1000} min={0} max={10} step={0.1} suffix="s" onChange={seconds => onChange({ ...variation, textDelayMs: Math.round(seconds * 1000) })} />
        <Slider label="Intro" value={variation.introMs / 1000} min={0} max={4} step={0.1} suffix="s" onChange={seconds => onChange({ ...variation, introMs: Math.round(seconds * 1000) })} />
        <Slider label="Outro" value={variation.outroMs / 1000} min={0} max={4} step={0.1} suffix="s" onChange={seconds => onChange({ ...variation, outroMs: Math.round(seconds * 1000) })} />
      </details>
    </div>
  );
}
