import { applyMessage, EMPTY_STATE, type BotState } from './state.ts';

/** The subset of a `ws` WebSocket that the client needs (also easy to fake in tests). */
export interface SocketLike {
  on(event: 'open' | 'close' | 'error', listener: () => void): unknown;
  on(event: 'message', listener: (data: unknown) => void): unknown;
  close(): void;
}

export interface BotClientOptions {
  /** Base URL of the bot. Only local addresses are accepted by the bot itself. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  createSocket: (url: string) => SocketLike;
  /** Timer functions, injectable for tests. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  minReconnectMs?: number;
  maxReconnectMs?: number;
}

export interface BotRequestResult { ok: boolean; error?: string; data?: unknown }

type Listener = (state: BotState, connected: boolean) => void;

/** Talks to the bot's local REST API and keeps a live copy of its state over the WebSocket. */
export class BotClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly minReconnectMs: number;
  private readonly maxReconnectMs: number;
  private readonly listeners = new Set<Listener>();
  private socket: SocketLike | null = null;
  private reconnectTimer: unknown = null;
  private reconnectDelay: number;
  private running = false;
  private token: string | null = null;
  private tokenRequest: Promise<string> | null = null;
  private current: BotState = EMPTY_STATE;
  private online = false;

  constructor(options: BotClientOptions) {
    this.baseUrl = (options.baseUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl || fetch;
    this.createSocket = options.createSocket;
    this.setTimer = options.setTimer || ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer || (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.minReconnectMs = options.minReconnectMs ?? 1000;
    this.maxReconnectMs = options.maxReconnectMs ?? 10000;
    this.reconnectDelay = this.minReconnectMs;
  }

  get state(): BotState { return this.current; }
  get connected(): boolean { return this.online; }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.openSocket();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer !== null) { this.clearTimer(this.reconnectTimer); this.reconnectTimer = null; }
    const socket = this.socket;
    this.socket = null;
    try { socket?.close(); } catch { /* already closed */ }
    this.setOnline(false);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try { listener(this.current, this.online); } catch { /* a faulty listener must not break the others */ }
    }
  }

  private setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    if (!online) this.token = null; // a restarted bot has a new session token
    this.emit();
  }

  private openSocket(): void {
    if (!this.running) return;
    const wsUrl = this.baseUrl.replace(/^http/i, 'ws') + '/ws';
    let socket: SocketLike;
    try { socket = this.createSocket(wsUrl); } catch { this.scheduleReconnect(); return; }
    this.socket = socket;
    socket.on('open', () => { if (this.socket === socket) this.reconnectDelay = this.minReconnectMs; });
    socket.on('message', raw => {
      if (this.socket !== socket) return;
      let message: unknown;
      try { message = JSON.parse(String(raw)); } catch { return; }
      const next = applyMessage(this.current, message);
      // The first message (the bot sends the full state on connect) marks the link as live.
      const changed = next !== this.current;
      const becameOnline = !this.online;
      this.current = next;
      this.online = true;
      if (changed || becameOnline) this.emit();
    });
    const lost = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setOnline(false);
      this.scheduleReconnect();
    };
    socket.on('close', lost);
    socket.on('error', lost);
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer !== null) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.maxReconnectMs, this.reconnectDelay * 2);
    this.reconnectTimer = this.setTimer(() => { this.reconnectTimer = null; this.openSocket(); }, delay);
  }

  private async sessionToken(force = false): Promise<string> {
    if (!force && this.token) return this.token;
    if (!this.tokenRequest) {
      this.tokenRequest = (async () => {
        const response = await this.fetchImpl(`${this.baseUrl}/api/session`);
        if (!response.ok) throw new Error(`Session request failed (HTTP ${response.status})`);
        const body = await response.json() as { token?: unknown };
        if (typeof body.token !== 'string' || !body.token) throw new Error('The bot returned no session token.');
        this.token = body.token;
        return body.token;
      })().finally(() => { this.tokenRequest = null; });
    }
    return this.tokenRequest;
  }

  /** POSTs to the bot. Never throws: failures are reported in the result so a key can show an alert. */
  async post(path: string, body?: unknown): Promise<BotRequestResult> {
    const send = async (token: string) => this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Session': token },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10000)
    });
    try {
      let response = await send(await this.sessionToken());
      if (response.status === 403) response = await send(await this.sessionToken(true)); // stale token after a bot restart
      const text = await response.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
      const payload = (data && typeof data === 'object' ? data : {}) as { success?: unknown; error?: unknown; message?: unknown };
      if (!response.ok) return { ok: false, error: String(payload.error || payload.message || `HTTP ${response.status}`), data };
      if (payload.success === false) return { ok: false, error: String(payload.error || payload.message || 'The bot reported a failure.'), data };
      return { ok: true, data };
    } catch (error) {
      this.token = null;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Downloads album art through the bot's artwork proxy and returns it as a data URI (or null). */
  async fetchArtwork(url: string): Promise<string | null> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/artwork-proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const type = (response.headers.get('content-type') || '').split(';')[0].trim();
      if (!/^image\/(png|jpe?g|gif)$/i.test(type)) return null; // the key renderer is only guaranteed to handle these
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 2 * 1024 * 1024) return null;
      return `data:${type};base64,${bytes.toString('base64')}`;
    } catch { return null; }
  }
}
