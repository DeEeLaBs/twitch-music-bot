import { useEffect, useState } from 'react';
import { apiFetch } from '../../apiClient.ts';
import {
  CREATOR_ANCHORS, CREATOR_EASES, CREATOR_EVENTS, CREATOR_LAYER_KINDS, CREATOR_MOTIONS, CREATOR_RANGES, CREATOR_SHAPES,
  ALERT_SOUND_MAX_BYTES,
  alertSoundType,
  assignCreatorShape,
  blankClip,
  dataUrlWithType,
  emptyCreatorLayer,
  type AlertBoxConfig, type CreatorEase, type CreatorEvent, type CreatorLayer, type CreatorLayerKind, type CreatorMotion, type CreatorRange, type CreatorShape
} from '../../alertBox.ts';
import type { AlertKind, AlertTier } from '../../streamAlerts.ts';
import { AlertFontField } from './AlertFontField.tsx';
import { CreatorStage, pauseCreatorTimeline, playCreatorTimeline } from './CreatorStage.tsx';

const EVENT_LABELS: Record<CreatorEvent, [string, string]> = {
  follow: ['Follow', 'Follow'],
  subscription: ['Abo', 'Subscription'],
  resub: ['Resub', 'Resub'],
  gift: ['Geschenk', 'Gift'],
  cheer: ['Cheer', 'Cheer'],
  raid: ['Raid', 'Raid'],
  tip: ['Spende', 'Donation'],
  host: ['Host', 'Host']
};
const KIND_LABELS: Record<CreatorLayerKind, [string, string]> = {
  text: ['Text', 'Text'],
  image: ['Bild', 'Image'],
  sound: ['Ton', 'Sound'],
  video: ['Video', 'Video'],
  shape: ['Form', 'Shape']
};
const SHAPE_LABELS: Record<CreatorShape, [string, string]> = {
  rectangle: ['Rechteck', 'Rectangle'],
  rounded: ['Abgerundetes Rechteck', 'Rounded rectangle'],
  ellipse: ['Ellipse', 'Ellipse'],
  line: ['Linie', 'Line']
};
const MOTION_LABELS: Record<CreatorMotion, [string, string]> = {
  none: ['Keine', 'None'],
  fade: ['Einblenden', 'Fade'],
  'slide-bottom': ['Von unten', 'From bottom'],
  'slide-top': ['Von oben', 'From top'],
  'slide-left': ['Von links', 'From left'],
  'slide-right': ['Von rechts', 'From right'],
  pop: ['Aufploppen', 'Pop'],
  'flip-x': ['Kippen horizontal', 'Flip horizontal'],
  'flip-y': ['Kippen vertikal', 'Flip vertical']
};
const OUT_LABELS: Record<CreatorMotion, [string, string]> = {
  ...MOTION_LABELS,
  fade: ['Ausblenden', 'Fade out'],
  'slide-bottom': ['Nach unten', 'To bottom'],
  'slide-top': ['Nach oben', 'To top'],
  'slide-left': ['Nach links', 'To left'],
  'slide-right': ['Nach rechts', 'To right'],
  pop: ['Wegploppen', 'Pop out'],
  'flip-x': ['Wegkippen horizontal', 'Flip out horizontal'],
  'flip-y': ['Wegkippen vertikal', 'Flip out vertical']
};
const RANGE_LABELS: Record<CreatorRange, [string, string]> = {
  'to-infinite': ['Bis unendlich', 'To infinite'],
  between: ['Zwischen', 'Between'],
  exactly: ['Genau', 'Exactly'],
  highest: ['Höchster', 'Highest']
};
const EASE_LABELS: Record<CreatorEase, string> = {
  none: 'none',
  linear: 'linear',
  'ease-in': 'ease In',
  'ease-out': 'ease Out',
  'ease-in-out': 'ease In Out',
  elastic: 'Elastic',
  swing: 'Swing In and Out',
  'swing-in': 'Swing In',
  'swing-out': 'Swing Out',
  bounce: 'Bounce'
};

function sampleFor(event: CreatorEvent) {
  const viewers = event === 'raid' || event === 'host' ? 24 : 0;
  const months = event === 'resub' ? 6 : event === 'subscription' ? 1 : 0;
  const amount = event === 'cheer' ? 100 : event === 'gift' ? 5 : event === 'tip' ? 5 : event === 'raid' || event === 'host' ? viewers : event === 'resub' ? months : event === 'subscription' ? 1 : 0;
  return {
    id: `sim-${event}-${Date.now()}`,
    kind: event as AlertKind,
    user: 'Viewer',
    amount,
    message: event === 'cheer' || event === 'tip' ? 'Hello' : '',
    months,
    tier: (event === 'subscription' || event === 'resub' || event === 'gift' ? '1000' : '') as AlertTier | '',
    currency: event === 'tip' ? 'EUR' : '',
    viewers,
    createdAt: Date.now()
  };
}

export function AlertCreatorPanel({
  config, language, onChange
}: {
  config: AlertBoxConfig;
  language: 'de' | 'en';
  onChange: (next: AlertBoxConfig, history: boolean) => void;
}) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const [event, setEvent] = useState<CreatorEvent>('cheer');
  const [selected, setSelected] = useState('');
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copyTo, setCopyTo] = useState<CreatorEvent>('follow');
  const clip = config.creator.clips.find(item => item.event === event);
  const layer = clip?.layers.find(item => item.id === selected) || null;
  const duration = config.durationMs;

  useEffect(() => {
    if (!playing) return undefined;
    const started = Date.now() - playhead;
    const timer = window.setInterval(() => {
      const next = Date.now() - started;
      if (next >= duration) {
        setPlayhead(duration);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, duration]);

  const writeClip = (layers: CreatorLayer[], patch: Partial<NonNullable<typeof clip>> = {}, history = true) => {
    const clips = [...config.creator.clips];
    const index = clips.findIndex(item => item.event === event);
    const base = index >= 0 ? clips[index] : blankClip(event, clips.length);
    const next = { ...base, ...patch, event, layers };
    if (index < 0) clips.push(next);
    else clips[index] = next;
    onChange({ ...config, creator: { clips } }, history);
  };
  const updateLayer = (next: CreatorLayer, history = false) => {
    if (!clip) return;
    writeClip(clip.layers.map(item => item.id === next.id ? next : item), {}, history);
  };
  const addLayer = (kind: CreatorLayerKind) => {
    const created = emptyCreatorLayer(kind, clip?.layers.length || 0);
    created.id = `layer_${Date.now().toString(36)}`;
    writeClip([...(clip?.layers || []), created]);
    setSelected(created.id);
  };
  const play = () => {
    setPlayhead(0);
    setPlaying(true);
    playCreatorTimeline(0);
    window.dispatchEvent(new CustomEvent('overlay:alert-sample', { detail: sampleFor(event) }));
  };
  const duplicate = () => {
    if (!clip) return;
    const clips = [...config.creator.clips];
    const index = clips.findIndex(item => item.event === copyTo);
    const copy = { ...clip, event: copyTo, id: `clip_${Date.now().toString(36)}`, layers: clip.layers.map(item => ({ ...item, id: `${item.id}_copy`, keyframes: item.keyframes.map(key => ({ ...key })) })) };
    if (index < 0) clips.push(copy);
    else clips[index] = { ...copy, id: clips[index].id, name: clips[index].name };
    onChange({ ...config, creator: { clips } }, true);
  };
  const keyIndex = layer ? layer.keyframes.findIndex(key => key.timeMs >= playhead - layer.startMs) : -1;
  const activeKey = layer && layer.keyframes.length ? layer.keyframes[Math.max(0, keyIndex)] : null;
  const previewAlert = sampleFor(event);

  return (
    <section className="alert-creator">
      <div className="canvas-presets">
        {CREATOR_EVENTS.map(id => (
          <button key={id} type="button" className={event === id ? 'is-active' : ''} onClick={() => { setEvent(id); setSelected(''); }}>
            {ui(...EVENT_LABELS[id])}
          </button>
        ))}
      </div>
      {(event === 'cheer' || event === 'gift' || event === 'raid') && (
        <div className="creator-chip">
          <label><span>{ui('Bereich', 'Range')}</span>
            <select value={clip?.range || 'to-infinite'} onChange={eventNode => writeClip(clip?.layers || [], { range: eventNode.target.value as CreatorRange })}>
              {CREATOR_RANGES.map(range => <option key={range} value={range}>{ui(...RANGE_LABELS[range])}</option>)}
            </select>
          </label>
          <label><span>{ui('Von', 'From')}</span><input inputMode="numeric" value={clip?.min ?? 1} onChange={eventNode => writeClip(clip?.layers || [], { min: Number(eventNode.target.value) || 0 }, false)} /></label>
          {(clip?.range || 'to-infinite') === 'between' && (
            <label><span>{ui('Bis', 'To')}</span><input inputMode="numeric" value={clip?.max ?? 100} onChange={eventNode => writeClip(clip?.layers || [], { max: Number(eventNode.target.value) || 0 }, false)} /></label>
          )}
        </div>
      )}
      <div className="creator-preview">
        {clip && clip.layers.length > 0
          ? <CreatorStage clip={clip} alert={previewAlert} config={config} language={language} elapsedMs={playhead} playing={playing} />
          : <p>{ui('Ebenen hinzufügen. Ohne Ebenen bleibt die Platte.', 'Add layers. With no layers the plate stays.')}</p>}
      </div>
      <div className="creator-transport">
        <button type="button" onClick={play}>{ui('Abspielen', 'Play')}</button>
        <input type="range" min={0} max={duration} value={Math.min(playhead, duration)} onChange={eventNode => { setPlaying(false); pauseCreatorTimeline(); setPlayhead(Number(eventNode.target.value)); }} />
        <span>{(playhead / 1000).toFixed(1)}s</span>
      </div>
      <div className="creator-timeline">
        {(clip?.layers || []).map((item, index) => (
          <button key={item.id} type="button" className={item.id === selected ? 'is-active' : ''} onClick={() => setSelected(item.id)}>
            <i style={{ left: `${(item.startMs / duration) * 100}%`, width: `${(item.lengthMs / duration) * 100}%` }} />
            <span>{index + 1} {ui(...KIND_LABELS[item.kind])}</span>
          </button>
        ))}
      </div>
      <div className="canvas-presets">
        {CREATOR_LAYER_KINDS.map(kind => (
          <button key={kind} type="button" onClick={() => addLayer(kind)}>{ui(...KIND_LABELS[kind])}</button>
        ))}
      </div>
      {layer && (
        <div className="creator-fields">
          <label><span>{ui('Start', 'Start')}</span><input inputMode="numeric" value={layer.startMs} onChange={eventNode => updateLayer({ ...layer, startMs: Number(eventNode.target.value) || 0 })} /></label>
          <label><span>{ui('Länge', 'Length')}</span><input inputMode="numeric" value={layer.lengthMs} onChange={eventNode => updateLayer({ ...layer, lengthMs: Number(eventNode.target.value) || 200 })} /></label>
          <label><span>{ui('Rein', 'In')}</span>
            <select value={layer.intro} onChange={eventNode => updateLayer({ ...layer, intro: eventNode.target.value as CreatorMotion }, true)}>
              {CREATOR_MOTIONS.map(motion => <option key={motion} value={motion}>{ui(...MOTION_LABELS[motion])}</option>)}
            </select>
          </label>
          <label><span>{ui('Raus', 'Out')}</span>
            <select value={layer.outro} onChange={eventNode => updateLayer({ ...layer, outro: eventNode.target.value as CreatorMotion }, true)}>
              {CREATOR_MOTIONS.map(motion => <option key={motion} value={motion}>{ui(...OUT_LABELS[motion])}</option>)}
            </select>
          </label>
          <label><span>X</span><input inputMode="numeric" value={layer.x} onChange={eventNode => updateLayer({ ...layer, x: Number(eventNode.target.value) || 0 })} /></label>
          <label><span>Y</span><input inputMode="numeric" value={layer.y} onChange={eventNode => updateLayer({ ...layer, y: Number(eventNode.target.value) || 0 })} /></label>
          <label><span>{ui('Breite', 'Width')}</span><input inputMode="numeric" value={layer.width} onChange={eventNode => updateLayer({ ...layer, width: Number(eventNode.target.value) || 4 })} /></label>
          <label><span>{ui('Höhe', 'Height')}</span><input inputMode="numeric" value={layer.height} onChange={eventNode => updateLayer({ ...layer, height: Number(eventNode.target.value) || 4 })} /></label>
          <label><span>{ui('Drehung', 'Rotation')}</span><input inputMode="numeric" value={layer.rotation} onChange={eventNode => updateLayer({ ...layer, rotation: Number(eventNode.target.value) || 0 })} /></label>
          <label><span>{ui('Anker', 'Anchor')}</span>
            <select value={layer.anchor} onChange={eventNode => updateLayer({ ...layer, anchor: eventNode.target.value as CreatorLayer['anchor'] }, true)}>
              {CREATOR_ANCHORS.map(anchor => <option key={anchor} value={anchor}>{anchor}</option>)}
            </select>
          </label>
          <label><span>{ui('Deckkraft', 'Opacity')}</span><input inputMode="numeric" value={layer.opacity} onChange={eventNode => updateLayer({ ...layer, opacity: Number(eventNode.target.value) || 0 })} /></label>
          {layer.kind === 'text' && (
            <>
              <label><span>{ui('Vorlage', 'Template')}</span><input value={layer.template} onChange={eventNode => updateLayer({ ...layer, template: eventNode.target.value })} /></label>
              <p className="alert-token-hint">{'{name} {amount} {months} {tier} {viewers} {message}'}</p>
              <label><span>{ui('Ausrichtung', 'Align')}</span>
                <select value={layer.align} onChange={eventNode => updateLayer({ ...layer, align: eventNode.target.value as CreatorLayer['align'] }, true)}>
                  <option value="left">{ui('Links', 'Left')}</option>
                  <option value="center">{ui('Mitte', 'Center')}</option>
                  <option value="right">{ui('Rechts', 'Right')}</option>
                </select>
              </label>
              <AlertFontField
                language={language}
                family={layer.fontFamily}
                fonts={config.fonts}
                onFamily={family => updateLayer({ ...layer, fontFamily: family }, true)}
                onLibrary={(fonts, family) => onChange({ ...config, fonts, creator: { clips: config.creator.clips.map(item => item.id === clip?.id ? { ...item, layers: item.layers.map(entry => entry.id === layer.id ? { ...entry, fontFamily: family } : entry) } : item) } }, true)}
              />
              <label><span>{ui('Schriftgröße', 'Font size')}</span><input inputMode="numeric" value={layer.fontSize} onChange={eventNode => updateLayer({ ...layer, fontSize: Number(eventNode.target.value) || 12 })} /></label>
              <label><span>{ui('Farbe', 'Color')}</span><input type="color" value={layer.color} onChange={eventNode => updateLayer({ ...layer, color: eventNode.target.value })} /></label>
              <label><span>{ui('Schatten', 'Shadow')}</span><input type="checkbox" checked={layer.shadow} onChange={eventNode => updateLayer({ ...layer, shadow: eventNode.target.checked }, true)} /></label>
              <label><span>{ui('Kontur', 'Stroke')}</span><input type="checkbox" checked={layer.stroke} onChange={eventNode => updateLayer({ ...layer, stroke: eventNode.target.checked }, true)} /></label>
              <label><span>{ui('Platte', 'Plate')}</span><input type="checkbox" checked={layer.plate} onChange={eventNode => updateLayer({ ...layer, plate: eventNode.target.checked }, true)} /></label>
            </>
          )}
          {layer.kind === 'shape' && (
            <>
              <label><span>{ui('Form', 'Shape')}</span>
                <select value={layer.shape} onChange={eventNode => updateLayer(assignCreatorShape(layer, eventNode.target.value as CreatorShape), true)}>
                  {CREATOR_SHAPES.map(shape => <option key={shape} value={shape}>{ui(...SHAPE_LABELS[shape])}</option>)}
                </select>
              </label>
              <label><span>{ui('Füllung', 'Fill')}</span><input type="color" value={layer.color} onChange={eventNode => updateLayer({ ...layer, color: eventNode.target.value })} /></label>
              <label><span>{ui('Kontur', 'Stroke')}</span><input type="checkbox" checked={layer.stroke} onChange={eventNode => updateLayer({ ...layer, stroke: eventNode.target.checked }, true)} /></label>
              {layer.stroke && <>
                <label><span>{ui('Konturfarbe', 'Stroke color')}</span><input type="color" value={layer.strokeColor} onChange={eventNode => updateLayer({ ...layer, strokeColor: eventNode.target.value })} /></label>
                <label><span>{ui('Konturstärke', 'Stroke width')}</span><input inputMode="numeric" value={layer.strokeWidth} onChange={eventNode => updateLayer({ ...layer, strokeWidth: Number(eventNode.target.value) || 0 })} /></label>
              </>}
              {layer.shape === 'rounded' && <label><span>{ui('Ecke', 'Radius')}</span><input inputMode="numeric" value={layer.radius} onChange={eventNode => updateLayer({ ...layer, radius: Number(eventNode.target.value) || 0 })} /></label>}
            </>
          )}
          {layer.kind === 'sound' && (
            <>
              <label><span>{ui('Tondatei', 'Sound file')}</span><input value={layer.soundUrl} onChange={eventNode => updateLayer({ ...layer, soundUrl: eventNode.target.value })} /></label>
              <label><span>{ui('Datei wählen', 'Choose file')}</span>
                <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a,.webm" onChange={async eventNode => {
                  const file = eventNode.target.files?.[0];
                  eventNode.currentTarget.value = '';
                  const type = file ? alertSoundType(file.name, file.type) : '';
                  if (!file || !type || file.size > ALERT_SOUND_MAX_BYTES) return;
                  const raw = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(file);
                  });
                  const response = await apiFetch('/api/v1/overlay/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'alert-sound', dataUrl: dataUrlWithType(raw, type) }) });
                  const json = await response.json() as { url?: string };
                  if (response.ok && json.url) updateLayer({ ...layer, soundUrl: json.url }, true);
                }} />
              </label>
              <label><span>{ui('Lautstärke', 'Volume')}</span><input inputMode="numeric" value={layer.volume} onChange={eventNode => updateLayer({ ...layer, volume: Number(eventNode.target.value) || 0 })} /></label>
            </>
          )}
          {(layer.kind === 'image' || layer.kind === 'video') && (
            <>
              <label><span>URL</span><input value={layer.url} onChange={eventNode => updateLayer({ ...layer, url: eventNode.target.value })} /></label>
              <label><span>{ui('Passung', 'Fit')}</span>
                <select value={layer.fit} onChange={eventNode => updateLayer({ ...layer, fit: eventNode.target.value as CreatorLayer['fit'] }, true)}>
                  <option value="contain">{ui('Einpassen', 'Contain')}</option>
                  <option value="cover">{ui('Füllen', 'Cover')}</option>
                </select>
              </label>
              <label><span>{ui('Ecke', 'Radius')}</span><input inputMode="numeric" value={layer.radius} onChange={eventNode => updateLayer({ ...layer, radius: Number(eventNode.target.value) || 0 })} /></label>
              {layer.kind === 'video' && (
                <label><span>{ui('Schleife', 'Loop')}</span><input type="checkbox" checked={layer.loop} onChange={eventNode => updateLayer({ ...layer, loop: eventNode.target.checked }, true)} /></label>
              )}
            </>
          )}
          <div className="creator-keys">
            <button type="button" onClick={() => {
              const timeMs = Math.max(0, playhead - layer.startMs);
              const key = { timeMs, x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, opacity: layer.opacity, ease: 'linear' as CreatorEase };
              const keyframes = [...layer.keyframes.filter(item => item.timeMs !== timeMs), key].sort((a, b) => a.timeMs - b.timeMs);
              updateLayer({ ...layer, motion: 'keyframes', keyframes }, true);
            }}>{ui('Keyframe', 'Keyframe')}</button>
            {activeKey && (
              <>
                <button type="button" onClick={() => setPlayhead(layer.startMs + (layer.keyframes[Math.max(0, layer.keyframes.indexOf(activeKey) - 1)] || activeKey).timeMs)}>{ui('Vorheriger', 'Previous')}</button>
                <label><span>{ui('Zeit', 'Time')}</span><input inputMode="numeric" value={activeKey.timeMs} onChange={eventNode => {
                  const timeMs = Number(eventNode.target.value) || 0;
                  updateLayer({ ...layer, keyframes: layer.keyframes.map(key => key === activeKey ? { ...key, timeMs } : key) });
                }} /></label>
                <button type="button" onClick={() => {
                  const keyframes = layer.keyframes.filter(key => key !== activeKey);
                  updateLayer({ ...layer, motion: keyframes.length ? 'keyframes' : 'basic', keyframes }, true);
                }}>{ui('Löschen', 'Delete')}</button>
                <button type="button" onClick={() => {
                  const next = layer.keyframes[Math.min(layer.keyframes.length - 1, layer.keyframes.indexOf(activeKey) + 1)];
                  setPlayhead(layer.startMs + next.timeMs);
                }}>{ui('Nächster', 'Next')}</button>
                <label><span>{ui('Übergang', 'Transition to next key')}</span>
                  <select value={activeKey.ease} onChange={eventNode => updateLayer({
                    ...layer,
                    keyframes: layer.keyframes.map(key => key === activeKey ? { ...key, ease: eventNode.target.value as CreatorEase } : key)
                  }, true)}>
                    {CREATOR_EASES.map(ease => <option key={ease} value={ease}>{EASE_LABELS[ease]}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          <button type="button" onClick={() => writeClip(clip?.layers.filter(item => item.id !== layer.id) || [])}>{ui('Ebene löschen', 'Delete layer')}</button>
        </div>
      )}
      <div className="creator-duplicate">
        <label><span>{ui('Kopieren nach', 'Duplicate onto')}</span>
          <select value={copyTo} onChange={eventNode => setCopyTo(eventNode.target.value as CreatorEvent)}>
            {CREATOR_EVENTS.filter(id => id !== event).map(id => <option key={id} value={id}>{ui(...EVENT_LABELS[id])}</option>)}
          </select>
        </label>
        <button type="button" onClick={duplicate} disabled={!clip?.layers.length}>{ui('Duplizieren', 'Duplicate')}</button>
      </div>
    </section>
  );
}
