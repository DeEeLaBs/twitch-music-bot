import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { SecureTokenStore } from './secureTokenStore.ts';
import { writeJson } from './atomicStore.ts';
import { DONATION_PROVIDERS, type CountdownBonus, type DonationProvider } from '../countdown.ts';
import { getCountdownService } from './countdownService.ts';

interface Connection { enabled: boolean; channel: string; username: string }
export interface DonationStatus extends Connection { configured: boolean; state: 'off' | 'connecting' | 'connected' | 'error'; message: string }
const defaults = (): Record<DonationProvider, Connection> => ({
  streamelements: { enabled: false, channel: '', username: '' },
  streamlabs: { enabled: false, channel: '', username: '' },
  tipeeestream: { enabled: false, channel: '', username: '' }
});
const secretKey = (provider: DonationProvider) => `${provider}CountdownToken` as const;
function timestamp(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
// Only monetary donations are consumed here. Subs/Bits come exclusively from Twitch.
export function donationEvents(provider: DonationProvider, payload: any, now = Date.now()): CountdownBonus[] {
  let items: any[] = [];
  if (provider === 'streamelements') {
    if (payload?.type !== 'message' || payload?.topic !== 'channel.tips' || payload?.data?.status !== 'success') return [];
    const d = payload.data;
    items = [{ ...d.donation, id: d.transactionId || d._id, name: d.donation?.user?.username, at: d.createdAt }];
  } else if (provider === 'streamlabs') {
    if (payload?.type !== 'donation' || (payload.for && payload.for !== 'streamlabs')) return [];
    items = Array.isArray(payload.message) ? payload.message : [];
  } else {
    const e = payload?.event;
    if (e?.type !== 'donation' || e.deleted_at) return [];
    items = [{ ...e.parameters, id: e.ref || e.id, at: e.created_at }];
  }
  return items.flatMap(item => {
    const id = String(item.id || item._id || '');
    const amount = Number(item.amount), currency = String(item.currency || '').toUpperCase();
    if (!id || id.length > 180 || !Number.isFinite(amount) || amount <= 0 || amount > 1e9 || !/^[A-Z]{3}$/.test(currency)) return [];
    return [{ id: `${provider}:${id}`, at: timestamp(item.at || item.created_at || item.createdAt, now), source: 'tip' as const,
      user: String(item.name || item.username || 'Anonym').slice(0, 80), amount, currency }];
  });
}

export class CountdownDonations {
  private readonly file: string;
  private readonly secrets: SecureTokenStore;
  private readonly openSocket: (url: URL) => WebSocket;
  private readonly acceptBonus: (event: CountdownBonus) => void;
  private settings = defaults();
  private statuses = new Map<DonationProvider, { state: DonationStatus['state']; message: string }>();
  private stops = new Map<DonationProvider, () => void>();
  private started = false;
  constructor(file = path.join(process.cwd(), 'data/countdown-connections.json'), secrets = new SecureTokenStore(),
    openSocket: (url: URL) => WebSocket = url => new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 1024 * 1024 }),
    acceptBonus: (event: CountdownBonus) => void = event => { getCountdownService().accept(event); }) {
    this.file = file;
    this.secrets = secrets;
    this.openSocket = openSocket;
    this.acceptBonus = acceptBonus;
    for (const file of [this.file, this.file + '.backup']) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const parsed = defaults();
        for (const provider of DONATION_PROVIDERS) parsed[provider] = this.validate(raw[provider]);
        this.settings = parsed;
        if (file !== this.file) writeJson(this.file, this.settings, { preserveBackup: true, strictAtomic: true });
        break;
      } catch { /* use next backup or disabled defaults */ }
    }
  }
  private validate(value: any): Connection {
    if (!value || typeof value.enabled !== 'boolean' || typeof value.channel !== 'string' || typeof value.username !== 'string' ||
        !/^[\w-]{0,100}$/.test(value.channel) || !/^[\w.-]{0,80}$/.test(value.username)) throw new Error('Ungültige Anbieter-Einstellungen.');
    return { enabled: value.enabled, channel: value.channel, username: value.username };
  }
  snapshot(): Record<DonationProvider, DonationStatus> {
    return Object.fromEntries(DONATION_PROVIDERS.map(provider => [provider, {
      ...this.settings[provider], configured: Boolean(this.secrets.get(secretKey(provider))),
      ...(this.statuses.get(provider) || { state: 'off', message: '' })
    }])) as Record<DonationProvider, DonationStatus>;
  }
  update(provider: DonationProvider, raw: unknown) {
    const value = raw as Connection & { token?: string };
    const settings = this.validate(value);
    if (value.token !== undefined && (typeof value.token !== 'string' || value.token.length > 8192 || /\s/.test(value.token))) throw new Error('Ungültiger Anbieter-Token.');
    const token = value.token || this.secrets.get(secretKey(provider));
    if (settings.enabled && !token) throw new Error('Bitte den Anbieter-Token eingeben.');
    if (settings.enabled && provider === 'streamelements' && !/^[a-f\d]{24}$/i.test(settings.channel)) throw new Error('Die StreamElements-Channel-ID muss 24 Hex-Zeichen enthalten.');
    if (settings.enabled && provider === 'tipeeestream' && !settings.username) throw new Error('Bitte den TipeeeStream-Benutzernamen eingeben.');
    if (value.token) this.secrets.set(secretKey(provider), value.token);
    const next = { ...this.settings, [provider]: settings };
    writeJson(this.file, next, { strictAtomic: true });
    this.settings = next;
    if (this.started) this.connect(provider);
    return this.snapshot();
  }
  start() { if (this.started) return; this.started = true; for (const p of DONATION_PROVIDERS) this.connect(p); }
  stop() { this.started = false; for (const stop of this.stops.values()) stop(); this.stops.clear(); }
  private connect(provider: DonationProvider) {
    this.stops.get(provider)?.();
    const settings = this.settings[provider];
    const token = this.secrets.get(secretKey(provider));
    const status = (state: DonationStatus['state'], message = '') => this.statuses.set(provider, { state, message });
    if (!settings.enabled) { status('off'); return; }
    if (!token) { status('error', 'Token fehlt oder ist nicht lesbar.'); return; }
    let stopped = false, socket: WebSocket | null = null, attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    this.stops.set(provider, () => {
      stopped = true; abort.abort(); clearTimeout(retry); clearTimeout(watchdog); clearInterval(heartbeat); socket?.terminate();
    });
    const accept = (raw: unknown) => {
      for (const event of donationEvents(provider, raw)) this.acceptBonus(event);
    };
    const open = async () => {
      if (stopped) return;
      status('connecting');
      let url: URL;
      try {
        if (provider === 'streamelements') url = new URL('wss://astro.streamelements.com/');
        else if (provider === 'streamlabs') {
          url = new URL('wss://sockets.streamlabs.com/socket.io/?EIO=3&transport=websocket');
          url.searchParams.set('token', token);
        } else {
          const response = await fetch('https://api.tipeeestream.com/v2.0/site/socket', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) });
          if (!response.ok) throw new Error('Discovery fehlgeschlagen');
          const body = await response.json() as { datas?: { host?: string; port?: string } };
          const host = new URL(body.datas?.host || '');
          if (host.protocol !== 'https:' || !/(^|\.)tipeeestream\.com$/.test(host.hostname) || host.username || host.password) throw new Error('Ungültiger Anbieter-Host');
          url = new URL(`wss://${host.hostname}:443/socket.io/?EIO=3&transport=websocket`);
          url.searchParams.set('access_token', token);
        }
        if (stopped) return;
        socket = this.openSocket(url);
        const current = socket;
        watchdog = setTimeout(() => current.terminate(), 20000); watchdog.unref();
        current.on('message', data => {
          if (stopped || current !== socket) return;
          try {
            const raw = String(data);
            if (provider === 'streamelements') {
              const message = JSON.parse(raw);
              if (message.type === 'welcome') current.send(JSON.stringify({ type: 'subscribe', nonce: 'countdown-tips', data: { topic: 'channel.tips', room: settings.channel, token, token_type: 'jwt' } }));
              else if (message.type === 'response') {
                clearTimeout(watchdog);
                if (message.error) { status('error', 'Anmeldung abgelehnt. Token und Channel-ID prüfen.'); current.close(); }
                else { status('connected'); attempt = 0; watchdog = setTimeout(() => current.terminate(), 70000); watchdog.unref(); }
              } else if (message.type === 'reconnect') current.close();
              else accept(message);
            } else {
              // These two provider APIs use Engine.IO 3 / Socket.IO 2, unlike our installed v4 client.
              if (raw.startsWith('0')) {
                const hello = JSON.parse(raw.slice(1));
                const interval = Math.max(1000, Math.min(60000, Number(hello.pingInterval) || 25000));
                clearInterval(heartbeat);
                heartbeat = setInterval(() => {
                  if (current.readyState !== WebSocket.OPEN) return;
                  current.send('2');
                  clearTimeout(watchdog); watchdog = setTimeout(() => current.terminate(), Math.max(1000, Math.min(30000, Number(hello.pingTimeout) || 10000))); watchdog.unref();
                }, interval); heartbeat.unref();
              } else if (raw === '3') clearTimeout(watchdog);
              else if (raw === '2') current.send('3');
              else if (raw === '40') {
                status('connected'); attempt = 0; clearTimeout(watchdog);
                if (provider === 'tipeeestream') current.send(`42${JSON.stringify(['join-room', { room: token, username: settings.username }])}`);
              } else if (raw.startsWith('42')) {
                const [event, payload] = JSON.parse(raw.slice(2));
                if (event === (provider === 'streamlabs' ? 'event' : 'new-event')) accept(payload);
              } else if (raw.startsWith('44')) { status('error', 'Anmeldung abgelehnt. Token prüfen.'); current.close(); }
            }
          } catch { status('error', 'Anbieter-Ereignis konnte nicht verarbeitet oder gespeichert werden.'); }
        });
        if (provider === 'streamelements') current.on('ping', () => {
          clearTimeout(watchdog); watchdog = setTimeout(() => current.terminate(), 70000); watchdog.unref();
        });
        current.on('error', () => { status('error', 'Verbindung fehlgeschlagen; erneuter Versuch folgt.'); current.terminate(); });
        current.on('close', () => { clearInterval(heartbeat); clearTimeout(watchdog); schedule(); });
      } catch { schedule(); }
    };
    const schedule = () => {
      if (stopped) return;
      status('error', 'Verbindung getrennt oder Anmeldung fehlgeschlagen; erneuter Versuch folgt.');
      clearTimeout(retry);
      retry = setTimeout(() => void open(), Math.min(60000, 2000 * 2 ** Math.min(attempt++, 5))); retry.unref();
    };
    void open();
  }
}
let donations: CountdownDonations | undefined;
export function getCountdownDonations() { return donations ??= new CountdownDonations(); }
export function stopCountdownDonations() { donations?.stop(); }
