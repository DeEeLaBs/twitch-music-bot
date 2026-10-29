import { normalizeAlertFonts, type AlertFontAsset } from './alertFonts.ts';

export const COUNTDOWN_IDS = ['streamstart', 'subathon'] as const;
export type CountdownId = typeof COUNTDOWN_IDS[number];
export const DONATION_PROVIDERS = ['streamelements', 'streamlabs', 'tipeeestream'] as const;
export type DonationProvider = typeof DONATION_PROVIDERS[number];
export type CountdownAction = 'start' | 'pause' | 'resume' | 'reset' | 'add';
export interface CountdownProfile {
  id: CountdownId;
  title: string;
  initialSeconds: number;
  limit: 'none' | 'remaining' | 'deadline';
  maxSeconds: number;
  deadline: number;
  bonuses: {
    subsEnabled: boolean; giftsEnabled: boolean; bitsEnabled: boolean; tipsEnabled: boolean;
    tier1: number; tier2: number; tier3: number; bitsPer100: number;
    currencies: Record<string, number>; rewards: Record<string, number>;
  };
  finish: {
    soundEnabled: boolean; soundUrl: string; alertEnabled: boolean; text: string;
    chatEnabled: boolean; chatMessage: string; hideEnabled: boolean; hideAfterSeconds: number;
    next: CountdownId | '';
  };
  look: { color: string; background: string; font: string; fonts?: AlertFontAsset[]; fontSize: number; showBonus: boolean; showTotal: boolean };
}
export interface CountdownRun {
  status: 'idle' | 'running' | 'paused' | 'finished';
  runId: string; startedAt: number; endsAt: number; remainingMs: number; completedAt: number;
  totalAddedMs: number; lastBonus: { text: string; milliseconds: number; at: number } | null;
}
export interface CountdownState {
  version: 1;
  profiles: Record<CountdownId, CountdownProfile>;
  runs: Record<CountdownId, CountdownRun>;
  seen: Array<{ id: string; at: number }>;
}
export interface CountdownBonus {
  id: string; at: number; source: 'sub' | 'gift' | 'bits' | 'tip' | 'reward';
  user: string; amount: number; tier?: string; currency?: string; rewardId?: string;
}
export function idleCountdown(): CountdownRun {
  return { status: 'idle', runId: '', startedAt: 0, endsAt: 0, remainingMs: 0, completedAt: 0, totalAddedMs: 0, lastBonus: null };
}
export function defaultCountdown(id: CountdownId): CountdownProfile {
  return {
    id, title: id === 'streamstart' ? 'Der Stream startet in' : 'Subathon', initialSeconds: id === 'streamstart' ? 300 : 3600,
    limit: 'none', maxSeconds: 86400, deadline: 0,
    bonuses: { subsEnabled: false, giftsEnabled: false, bitsEnabled: false, tipsEnabled: false,
      tier1: 300, tier2: 600, tier3: 1500, bitsPer100: 60, currencies: { EUR: 60, USD: 60 }, rewards: {} },
    finish: { soundEnabled: true, soundUrl: '', alertEnabled: true, text: 'Countdown beendet!', chatEnabled: true,
      chatMessage: 'Der Countdown ist beendet!', hideEnabled: true, hideAfterSeconds: 10, next: '' },
    look: { color: '#ffffff', background: '#00000000', font: 'Segoe UI', fonts: [], fontSize: 96, showBonus: true, showTotal: false }
  };
}
export function emptyCountdownState(): CountdownState {
  return { version: 1, profiles: { streamstart: defaultCountdown('streamstart'), subathon: defaultCountdown('subathon') },
    runs: { streamstart: idleCountdown(), subathon: idleCountdown() }, seen: [] };
}
export function countdownId(value: unknown): CountdownId {
  if (!COUNTDOWN_IDS.includes(value as CountdownId)) throw new Error('Unbekanntes Countdown-Profil.');
  return value as CountdownId;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Zahl zwischen ${min} und ${max} erwartet.`);
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Ungültiger Text.');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Ein-/Aus-Wert erwartet.');
  return value;
}
const YEAR = 366 * 86400;
export function validateCountdownProfile(value: unknown, id: CountdownId): CountdownProfile {
  const p = value as CountdownProfile;
  if (!p || !p.bonuses || !p.finish || !p.look) throw new Error('Countdown-Einstellungen fehlen.');
  if (!['none', 'remaining', 'deadline'].includes(p.limit)) throw new Error('Ungültige Zeitbegrenzung.');
  const map = (value: unknown, currency: boolean): Record<string, number> => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 50) throw new Error('Ungültige Bonusregeln.');
    return Object.fromEntries(Object.entries(value).map(([key, seconds]) => {
      if (!(currency ? /^[A-Z]{3}$/ : /^[\w-]{1,100}$/).test(key)) throw new Error('Ungültige Währung oder Reward-ID.');
      return [key, number(seconds, 0, YEAR)];
    }));
  };
  const soundUrl = text(p.finish.soundUrl, 250);
  if (soundUrl && !/^\/overlay-assets\/[\w.-]+\.(mp3|wav|ogg|webm|m4a)$/.test(soundUrl)) throw new Error('Bitte einen lokalen Sound hochladen.');
  if (p.finish.next !== '' && (!COUNTDOWN_IDS.includes(p.finish.next) || p.finish.next === id)) throw new Error('Ungültiges Folgeprofil.');
  if (!/^#[a-f\d]{6}$/i.test(p.look.color) || !/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(p.look.background)) throw new Error('Ungültige Farbe.');
  if (!/^[\p{L}\p{N} ,"'._-]{1,160}$/u.test(p.look.font)) throw new Error('Ungültige Schrift.');
  return {
    id, title: text(p.title, 120), initialSeconds: number(p.initialSeconds, 1, YEAR), limit: p.limit,
    maxSeconds: number(p.maxSeconds, 1, YEAR), deadline: number(p.deadline, 0, 8640000000000000),
    bonuses: { subsEnabled: bool(p.bonuses.subsEnabled), giftsEnabled: bool(p.bonuses.giftsEnabled), bitsEnabled: bool(p.bonuses.bitsEnabled), tipsEnabled: bool(p.bonuses.tipsEnabled),
      tier1: number(p.bonuses.tier1, 0, YEAR), tier2: number(p.bonuses.tier2, 0, YEAR), tier3: number(p.bonuses.tier3, 0, YEAR), bitsPer100: number(p.bonuses.bitsPer100, 0, YEAR),
      currencies: map(p.bonuses.currencies, true), rewards: map(p.bonuses.rewards, false) },
    finish: { soundEnabled: bool(p.finish.soundEnabled), soundUrl, alertEnabled: bool(p.finish.alertEnabled), text: text(p.finish.text, 200),
      chatEnabled: bool(p.finish.chatEnabled), chatMessage: text(p.finish.chatMessage, 350).replace(/[\r\n]/g, ' '),
      hideEnabled: bool(p.finish.hideEnabled), hideAfterSeconds: number(p.finish.hideAfterSeconds, 0, 3600), next: p.finish.next },
    look: { color: p.look.color, background: p.look.background, font: p.look.font, fonts: normalizeAlertFonts(p.look.fonts), fontSize: number(p.look.fontSize, 16, 400), showBonus: bool(p.look.showBonus), showTotal: bool(p.look.showTotal) }
  };
}
export function remainingCountdown(profile: CountdownProfile, run: CountdownRun, now = Date.now()): number {
  let ms = run.status === 'running' ? run.endsAt - now : run.status === 'idle' ? profile.initialSeconds * 1000 : run.remainingMs;
  if (run.status === 'finished') return 0;
  if (profile.limit === 'remaining') ms = Math.min(ms, profile.maxSeconds * 1000);
  if (profile.limit === 'deadline' && run.status !== 'idle') ms = Math.min(ms, profile.deadline - now);
  return Math.max(0, ms);
}
export function bonusSeconds(profile: CountdownProfile, event: CountdownBonus): number {
  if (!Number.isFinite(event.amount) || event.amount <= 0) return 0;
  const b = profile.bonuses;
  const tier = event.tier === '3000' ? b.tier3 : event.tier === '2000' ? b.tier2 : b.tier1;
  if (event.source === 'sub' && b.subsEnabled) return tier;
  if (event.source === 'gift' && b.giftsEnabled) return tier * Math.floor(event.amount);
  if (event.source === 'bits' && b.bitsEnabled) return event.amount / 100 * b.bitsPer100;
  if (event.source === 'tip' && b.tipsEnabled) return event.amount * (b.currencies[event.currency || ''] || 0);
  if (event.source === 'reward') return b.rewards[event.rewardId || ''] || 0;
  return 0;
}
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
