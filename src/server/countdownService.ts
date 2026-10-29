import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJson } from './atomicStore.ts';
import { COUNTDOWN_IDS, bonusSeconds, countdownId, emptyCountdownState, formatCountdown, idleCountdown, remainingCountdown, validateCountdownProfile,
  type CountdownAction, type CountdownBonus, type CountdownId, type CountdownProfile, type CountdownState } from '../countdown.ts';

export class CountdownService {
  private state = emptyCountdownState();
  private readonly file: string;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private storageError = '';
  private finished: (profile: CountdownProfile) => void = () => {};

  constructor(file = path.join(process.cwd(), 'data/countdowns.json'), now = Date.now) {
    this.file = file;
    this.now = now;
    let loaded = false;
    for (const candidate of [file, file + '.backup']) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(candidate, 'utf8')) as CountdownState;
        if (raw.version !== 1 || !raw.runs || !Array.isArray(raw.seen)) throw new Error('Ungültiger Countdown-Speicher.');
        for (const id of COUNTDOWN_IDS) {
          raw.profiles[id] = validateCountdownProfile(raw.profiles[id], id);
          const run = raw.runs[id];
          if (!run || !['idle', 'running', 'paused', 'finished'].includes(run.status) || typeof run.runId !== 'string' ||
              !['startedAt', 'endsAt', 'remainingMs', 'completedAt', 'totalAddedMs'].every(key => Number.isFinite(run[key]) && run[key] >= 0)) throw new Error('Ungültiger Timerzustand.');
        }
        raw.seen = raw.seen.filter(item => typeof item.id === 'string' && Number.isFinite(item.at) && item.at > this.now() - 86400000);
        this.state = raw;
        if (candidate !== file) writeJson(file, raw, { preserveBackup: true, strictAtomic: true });
        loaded = true;
        break;
      } catch { console.warn('[Countdown] Speicher konnte nicht geladen werden; prüfe Hauptdatei und Backup.'); }
    }
    if (!loaded && (fs.existsSync(file) || fs.existsSync(file + '.backup'))) this.storageError = 'Countdown-Speicher und Backup sind unlesbar. Bitte die Originaldateien wiederherstellen; es wird nichts überschrieben.';
  }

  start(onFinished: (profile: CountdownProfile) => void) {
    this.finished = onFinished;
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => {
      try { this.tick(); } catch (error) { console.error('[Countdown] Timer konnte nicht gespeichert werden:', error); }
    }, 250);
    this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  snapshot() {
    return { ...structuredClone(this.state), serverNow: this.now(), storageError: this.storageError };
  }
  private persist() { writeJson(this.file, this.state, { strictAtomic: true }); }
  private change(fn: () => void) {
    if (this.storageError) throw new Error(this.storageError);
    const before = structuredClone(this.state);
    try { fn(); this.persist(); } catch (error) { this.state = before; throw error; }
  }
  update(id: CountdownId, value: unknown) {
    const profile = validateCountdownProfile(value, id);
    if (profile.finish.next && this.state.profiles[profile.finish.next].finish.next === id) throw new Error('Folgeprofile dürfen keinen Kreis bilden.');
    if (profile.limit === 'deadline' && profile.deadline <= this.now()) throw new Error('Der Endzeitpunkt muss in der Zukunft liegen.');
    this.change(() => {
      const run = this.state.runs[id];
      const remaining = remainingCountdown(this.state.profiles[id], run, this.now());
      this.state.profiles[id] = profile;
      if (run.status === 'running' || run.status === 'paused') {
        run.remainingMs = remaining;
        run.endsAt = this.now() + remaining;
        run.remainingMs = remainingCountdown(profile, run, this.now());
        if (run.status === 'running') run.endsAt = this.now() + run.remainingMs;
      }
    });
    this.tick();
    return this.snapshot();
  }
  command(id: CountdownId, action: CountdownAction, seconds?: number) {
    this.tick();
    const now = this.now();
    const p = this.state.profiles[id];
    if (!['start', 'pause', 'resume', 'reset', 'add'].includes(action)) throw new Error('Unbekannte Countdown-Aktion.');
    this.change(() => {
      const run = this.state.runs[id];
      const remaining = remainingCountdown(p, run, now);
      if (action === 'reset') this.state.runs[id] = idleCountdown();
      else if (action === 'start') {
        if (run.status === 'running' || run.status === 'paused') throw new Error('Timer läuft bereits. Zum Neustart zuerst zurücksetzen.');
        if (p.limit === 'deadline' && p.deadline <= now) throw new Error('Der Endzeitpunkt liegt in der Vergangenheit.');
        const ms = Math.min(p.initialSeconds * 1000, p.limit === 'remaining' ? p.maxSeconds * 1000 : p.limit === 'deadline' ? p.deadline - now : Infinity);
        this.state.runs[id] = { ...idleCountdown(), status: 'running', runId: crypto.randomUUID(), startedAt: now, endsAt: now + ms, remainingMs: ms };
      } else if (action === 'pause') {
        if (run.status !== 'running') throw new Error('Nur laufende Timer können pausiert werden.');
        run.status = 'paused'; run.remainingMs = remaining;
      } else if (action === 'resume') {
        if (run.status !== 'paused') throw new Error('Nur pausierte Timer können fortgesetzt werden.');
        run.status = 'running'; run.endsAt = now + remaining;
      } else {
        if (typeof seconds !== 'number' || !Number.isFinite(seconds) || Math.abs(seconds) > 366 * 86400) throw new Error('Ungültige Zeitänderung.');
        if (run.status !== 'running' && run.status !== 'paused') throw new Error('Bitte den Timer zuerst starten.');
        const ms = Math.max(0, Math.min(remaining + seconds * 1000, p.limit === 'remaining' ? p.maxSeconds * 1000 : p.limit === 'deadline' ? p.deadline - now : 366 * 86400000));
        if (ms > remaining) {
          const added = Math.round(ms - remaining);
          run.totalAddedMs += added;
          run.lastBonus = { text: 'Manuell', milliseconds: added, at: now };
        }
        run.remainingMs = ms; run.endsAt = now + ms;
      }
    });
    this.tick();
    return this.snapshot();
  }
  accept(event: CountdownBonus): boolean {
    this.tick();
    const now = this.now();
    if (!event.id || event.id.length > 250 || !Number.isFinite(event.at) || event.at > now + 60000 || event.at < now - 86400000 || this.state.seen.some(item => item.id === event.id)) return false;
    this.change(() => {
      this.state.seen = [...this.state.seen.filter(item => item.at > now - 86400000), { id: event.id, at: now }];
      for (const id of COUNTDOWN_IDS) {
        const p = this.state.profiles[id], run = this.state.runs[id];
        if (!['running', 'paused'].includes(run.status) || event.at < run.startedAt) continue;
        const seconds = bonusSeconds(p, event);
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        const before = remainingCountdown(p, run, now);
        const after = Math.max(0, Math.min(before + seconds * 1000, p.limit === 'remaining' ? p.maxSeconds * 1000 : p.limit === 'deadline' ? p.deadline - now : 366 * 86400000));
        const added = Math.round(after - before);
        if (added <= 0) continue;
        run.remainingMs = after; run.endsAt = now + after; run.totalAddedMs += added;
        const source = { sub: 'Abo', gift: 'Geschenk-Abos', bits: 'Bits', tip: 'Spende', reward: 'Kanalpunkte' }[event.source];
        run.lastBonus = { text: `${event.user.slice(0, 80) || 'Anonym'} · ${source}`, milliseconds: added, at: now };
      }
    });
    return true;
  }
  tick() {
    const now = this.now();
    for (const id of COUNTDOWN_IDS) {
      const profile = this.state.profiles[id], run = this.state.runs[id];
      if (!['running', 'paused'].includes(run.status) || remainingCountdown(profile, run, now) > 0) continue;
      // Persist completion before side effects: a restart must not replay finish actions.
      this.change(() => { run.status = 'finished'; run.remainingMs = 0; run.completedAt = now; });
      try { this.finished(structuredClone(profile)); } catch (error) { console.warn('[Countdown] Abschlussaktion fehlgeschlagen:', error); }
      const next = profile.finish.next;
      if (next && !['running', 'paused'].includes(this.state.runs[next].status)) {
        try { this.command(next, 'start'); } catch (error) { console.warn('[Countdown] Folgeprofil konnte nicht starten:', error); }
      }
    }
  }
  chat(message: string, privileged: boolean): string | null {
    if (!/^!timer(?:\s|$)/i.test(message.trim())) return null;
    if (!privileged) return 'Countdown-Steuerung ist nur für Moderatoren und Streamer verfügbar.';
    try {
      const [, profile, action, rawSeconds, ...extra] = message.trim().split(/\s+/);
      if (!profile || !action || extra.length || (action !== 'add' && rawSeconds !== undefined)) throw new Error('!timer streamstart|subathon start|pause|resume|reset oder add <Sekunden>');
      const id = countdownId(profile);
      const state = this.command(id, action as CountdownAction, rawSeconds === undefined ? undefined : Number(rawSeconds));
      return `${state.profiles[id].title}: ${formatCountdown(remainingCountdown(state.profiles[id], state.runs[id], state.serverNow))} (${state.runs[id].status})`;
    } catch (error) { return error instanceof Error ? error.message : 'Countdown konnte nicht gesteuert werden.'; }
  }
}
let service: CountdownService | undefined;
export function getCountdownService() { return service ??= new CountdownService(); }
export function stopCountdownService() { service?.stop(); }
