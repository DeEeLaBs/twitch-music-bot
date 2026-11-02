import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_OVERLAY_OPTIONS, mergeOverlayOptions, type OverlayOptions } from '../overlayOptions.ts';
import { writeJson } from './atomicStore.ts';
import { BotError } from './errors.ts';

export interface SavedOverlay { id: string; name: string; options: OverlayOptions }
interface LibraryState { version: 1; legacyId: string; overlays: SavedOverlay[]; legacyOptions?: OverlayOptions }
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
function nameOf(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\x00-\x1f\x7f]/.test(value))
    throw new BotError('VALIDATION', 'Bitte einen Namen mit 1 bis 80 Zeichen eingeben.', 400);
  return value.trim();
}
function optionsOf(value: unknown): OverlayOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BotError('VALIDATION', 'Ungültiges Overlay-Design.', 400);
  const incoming = value as Record<string, unknown>;
  for (const [key, sample] of Object.entries(DEFAULT_OVERLAY_OPTIONS)) {
    const field = incoming[key];
    if (field === undefined) continue;
    if ((typeof sample === 'number' && (typeof field !== 'number' || !Number.isFinite(field))) ||
        (typeof sample === 'boolean' && typeof field !== 'boolean') ||
        (typeof sample === 'string' && typeof field !== 'string'))
      throw new BotError('VALIDATION', `Ungültige Overlay-Einstellung: ${key}`, 400);
  }
  for (const key of ['scene', 'chat', 'positions', 'alertBox']) {
    if (incoming[key] !== undefined && (!incoming[key] || typeof incoming[key] !== 'object' || Array.isArray(incoming[key])))
      throw new BotError('VALIDATION', `Ungültige Overlay-Einstellung: ${key}`, 400);
  }
  try { return mergeOverlayOptions(incoming as Partial<OverlayOptions>); }
  catch { throw new BotError('VALIDATION', 'Ungültiges Overlay-Design.', 400); }
}
export class OverlayLibrary {
  private state: LibraryState;
  private readonly file: string;
  constructor(file = path.join(process.cwd(), 'data/overlays.json'), legacy = path.join(process.cwd(), 'data/overlay-config.json')) {
    this.file = file;
    let loaded: LibraryState | undefined;
    for (const candidate of [file, file + '.backup']) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(candidate, 'utf8')) as LibraryState;
        if (raw.version !== 1 || !validId(raw.legacyId) || !Array.isArray(raw.overlays)) throw new Error('Invalid library');
        const ids = new Set<string>();
        for (const item of raw.overlays) {
          if (!validId(item.id) || ids.has(item.id)) throw new Error('Invalid overlay ID');
          ids.add(item.id); item.name = nameOf(item.name); item.options = optionsOf(item.options);
        }
        if (raw.legacyOptions) raw.legacyOptions = optionsOf(raw.legacyOptions);
        if (candidate !== file) writeJson(file, raw, { strictAtomic: true, preserveBackup: true });
        loaded = raw;
        break;
      } catch { /* Try the backup, preserving unreadable files. */ }
    }
    if (!loaded && (fs.existsSync(file) || fs.existsSync(file + '.backup')))
      throw new Error('Overlay-Sammlung und Backup sind unlesbar. Originaldateien wiederherstellen.');
    if (!loaded) {
      let options = structuredClone(DEFAULT_OVERLAY_OPTIONS);
      let found = false;
      for (const candidate of [legacy, legacy + '.backup']) {
        if (!fs.existsSync(candidate)) continue;
        try { options = optionsOf(JSON.parse(fs.readFileSync(candidate, 'utf8'))); found = true; break; } catch { /* try backup */ }
      }
      if (!found && (fs.existsSync(legacy) || fs.existsSync(legacy + '.backup'))) throw new Error('Bisheriges Overlay ist unlesbar; Übernahme abgebrochen.');
      const id = crypto.randomUUID();
      loaded = { version: 1, legacyId: id, overlays: [{ id, name: 'Mein Overlay', options }] };
      writeJson(file, loaded, { strictAtomic: true });
    }
    this.state = loaded;
  }
  get legacyOptions() {
    return structuredClone(this.state.overlays.find(item => item.id === this.state.legacyId)?.options ?? this.state.legacyOptions ?? DEFAULT_OVERLAY_OPTIONS);
  }
  updateLegacy(options: unknown) {
    if (this.state.overlays.some(item => item.id === this.state.legacyId)) return this.update(this.state.legacyId, options).options;
    const normalized = optionsOf(options);
    this.commit({ ...this.state, legacyOptions: normalized });
    return structuredClone(normalized);
  }
  get legacyId() { return this.state.legacyId; }
  list() { return this.state.overlays.map(({ id, name, options }) => ({ id, name, width: options.scene?.design.width ?? 1920, height: options.scene?.design.height ?? 1080, widgets: options.scene?.widgets.length ?? 1 })); }
  get(id: string): SavedOverlay {
    const item = validId(id) && this.state.overlays.find(item => item.id === id);
    if (!item) throw new BotError('NOT_FOUND', 'Overlay nicht gefunden.', 404);
    return structuredClone(item);
  }
  private commit(next: LibraryState) {
    try { writeJson(this.file, next, { strictAtomic: true }); }
    catch { throw new BotError('INTERNAL', 'Overlay konnte nicht gespeichert werden. Das bisherige Design bleibt erhalten.', 500); }
    this.state = next;
  }
  create(name: unknown, sourceId?: string) {
    const item: SavedOverlay = { id: crypto.randomUUID(), name: nameOf(name), options: sourceId === undefined ? structuredClone(DEFAULT_OVERLAY_OPTIONS) : this.get(sourceId).options };
    this.commit({ ...this.state, overlays: [...this.state.overlays, item] });
    return structuredClone(item);
  }
  rename(id: string, name: unknown) {
    const item = { ...this.get(id), name: nameOf(name) };
    this.commit({ ...this.state, overlays: this.state.overlays.map(current => current.id === id ? item : current) });
    return structuredClone(item);
  }
  update(id: string, options: unknown) {
    const item = { ...this.get(id), options: optionsOf(options) };
    this.commit({ ...this.state, overlays: this.state.overlays.map(current => current.id === id ? item : current) });
    return structuredClone(item);
  }
  remove(id: string) {
    const item = this.get(id);
    this.commit({ ...this.state, ...(id === this.state.legacyId ? { legacyOptions: item.options } : {}), overlays: this.state.overlays.filter(item => item.id !== id) });
  }
}
