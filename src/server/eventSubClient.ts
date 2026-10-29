import { WebSocket } from 'ws';
import { alertFromNotification, eventSubSubscriptions, type StreamAlert } from '../streamAlerts.ts';

interface EventAuth {
  token: string;
  clientId: string;
  broadcasterId: string;
  scopes: string[];
}

export class EventSubClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private keepalive: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private readonly onAlert: (alert: StreamAlert) => void;
  private readonly log: (message: string) => void;

  constructor(onAlert: (alert: StreamAlert) => void, log: (message: string) => void) {
    this.onAlert = onAlert;
    this.log = log;
  }

  start(auth: EventAuth) {
    this.stopped = false;
    this.open('wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30', auth, true);
  }

  stop() {
    this.stopped = true;
    if (this.keepalive) clearTimeout(this.keepalive);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  private open(url: string, auth: EventAuth, subscribe: boolean) {
    if (this.stopped) return;
    const socket = new WebSocket(url);
    const previous = this.socket;
    this.socket = socket;
    if (previous && previous !== socket) previous.close();
    socket.on('message', raw => {
      void this.onMessage(String(raw), auth, subscribe, socket);
    });
    socket.on('close', () => {
      if (this.socket !== socket || this.stopped) return;
      this.reconnectTimer = setTimeout(() => this.open('wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30', auth, true), 5000);
      this.reconnectTimer.unref?.();
    });
    socket.on('error', () => socket.close());
  }

  private async onMessage(raw: string, auth: EventAuth, subscribe: boolean, socket: WebSocket) {
    if (this.stopped || this.socket !== socket) return;
    let message: { metadata?: { message_type?: string }; payload?: { session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string } } };
    try { message = JSON.parse(raw); } catch { return; }
    const type = message.metadata?.message_type;
    const session = message.payload?.session;
    if (session?.keepalive_timeout_seconds) this.armKeepalive(socket, session.keepalive_timeout_seconds);
    if (type === 'session_welcome' && session?.id && subscribe) {
      this.log('EventSub session ready');
      await this.subscribe(auth, session.id);
    } else if (type === 'session_reconnect' && session?.reconnect_url) {
      this.open(session.reconnect_url, auth, false);
    } else if (type === 'notification') {
      const alert = alertFromNotification(message);
      if (alert) this.onAlert(alert);
    } else if (type === 'session_keepalive') {
      this.armKeepalive(socket, session?.keepalive_timeout_seconds || 30);
    }
  }

  private armKeepalive(socket: WebSocket, seconds: number) {
    if (this.keepalive) clearTimeout(this.keepalive);
    this.keepalive = setTimeout(() => socket.close(), (seconds + 5) * 1000);
    this.keepalive.unref?.();
  }

  private async subscribe(auth: EventAuth, sessionId: string) {
    if (this.stopped) return;
    const headers = { Authorization: `Bearer ${auth.token}`, 'Client-Id': auth.clientId, 'Content-Type': 'application/json' };
    for (const body of eventSubSubscriptions(auth.broadcasterId, sessionId, auth.scopes)) {
      try {
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
        if (!response.ok && response.status !== 409) this.log(`Subscription ${String(body.type)} was not accepted (${response.status}). Reconnect Twitch so the new alert scopes are granted.`);
      } catch (error) {
        this.log(`Subscription ${String(body.type)} failed: ${error instanceof Error ? error.message : 'network'}`);
      }
    }
  }
}
