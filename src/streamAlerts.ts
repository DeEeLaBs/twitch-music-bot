export type AlertKind = 'follow' | 'subscription' | 'resub' | 'gift' | 'communitygift' | 'tip' | 'cheer' | 'raid' | 'host';
export type AlertTier = 'prime' | '1000' | '2000' | '3000';

export interface StreamAlert {
  id: string;
  kind: AlertKind;
  user: string;
  amount: number;
  createdAt: number;
  message: string;
  months: number;
  tier: AlertTier | '';
  currency: string;
  viewers: number;
}

export const ALERT_PRIORITY: Record<AlertKind, number> = {
  raid: 8,
  communitygift: 7,
  gift: 6,
  subscription: 5,
  resub: 5,
  tip: 4,
  cheer: 4,
  host: 2,
  follow: 1
};

export const ALERT_DURATION_MS: Record<AlertKind, number> = {
  raid: 8000,
  communitygift: 8000,
  gift: 7000,
  subscription: 6000,
  resub: 6000,
  tip: 6000,
  cheer: 5000,
  host: 5000,
  follow: 4000
};

const CAP = 30;

export function alertText(alert: StreamAlert, language: 'de' | 'en'): string {
  const user = alert.user || (language === 'de' ? 'Jemand' : 'Someone');
  const months = alert.months || alert.amount;
  const lines = {
    de: {
      follow: `${user} folgt jetzt`,
      subscription: `${user} hat abonniert`,
      resub: `${user} ist seit ${months} Monaten dabei`,
      gift: `${user} hat ${alert.amount} Abos verschenkt`,
      communitygift: `${user} hat ${alert.amount} Abos verschenkt`,
      tip: `${user} hat ${alert.amount} ${alert.currency || ''} gegeben`.trim(),
      cheer: `${user} hat ${alert.amount} Bits geschickt`,
      raid: `${user} raidet mit ${alert.viewers || alert.amount} Zuschauern`,
      host: `${user} hostet mit ${alert.viewers || alert.amount} Zuschauern`
    },
    en: {
      follow: `${user} followed`,
      subscription: `${user} subscribed`,
      resub: `${user} resubscribed for ${months} months`,
      gift: `${user} gifted ${alert.amount} subs`,
      communitygift: `${user} gifted ${alert.amount} subs`,
      tip: `${user} donated ${alert.amount} ${alert.currency || ''}`.trim(),
      cheer: `${user} cheered ${alert.amount} bits`,
      raid: `${user} is raiding with ${alert.viewers || alert.amount} viewers`,
      host: `${user} is hosting with ${alert.viewers || alert.amount} viewers`
    }
  };
  return lines[language][alert.kind];
}

export function pushAlert(queue: readonly StreamAlert[], alert: StreamAlert, cap = CAP): StreamAlert[] {
  const next = [...queue, alert].sort((a, b) => ALERT_PRIORITY[b.kind] - ALERT_PRIORITY[a.kind] || a.createdAt - b.createdAt);
  while (next.length > cap) {
    let drop = next.length - 1;
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (next[index].kind === 'follow') {
        drop = index;
        break;
      }
    }
    next.splice(drop, 1);
  }
  return next;
}

interface EventSubPayload {
  subscription?: { type?: string };
  event?: Record<string, unknown>;
}

export function alertFromNotification(raw: unknown, now = Date.now()): StreamAlert | null {
  const payload = (raw as { payload?: EventSubPayload } | null)?.payload;
  const type = payload?.subscription?.type || '';
  const event = payload?.event || {};
  const text = (value: unknown, max = 40) => String(value || '').slice(0, max);
  const amount = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
  const tier = (value: unknown): StreamAlert['tier'] => value === 'prime' || value === '1000' || value === '2000' || value === '3000' ? value : '';
  const body = text(typeof event.message === 'string' ? event.message : (event.message as { text?: unknown } | undefined)?.text, 280);
  const base = (kind: AlertKind, user: string, value: number): StreamAlert => ({
    id: `${type}:${now}:${text(event.user_login || event.from_broadcaster_user_login)}`,
    kind, user, amount: value, createdAt: now, message: body, months: amount(event.cumulative_months), tier: tier(event.tier), currency: '', viewers: amount(event.viewers)
  });
  if (type === 'channel.follow') return base('follow', text(event.user_name), 0);
  if (type === 'channel.subscribe') {
    if (event.is_gift === true) return null;
    return { ...base('subscription', text(event.user_name), 1), months: 1 };
  }
  if (type === 'channel.subscription.message') return { ...base('resub', text(event.user_name), amount(event.cumulative_months)), months: amount(event.cumulative_months) };
  if (type === 'channel.subscription.gift') {
    const total = amount(event.total);
    return base(total > 1 ? 'communitygift' : 'gift', text(event.user_name) || 'Anonymous', total);
  }
  if (type === 'channel.cheer') return base('cheer', text(event.user_name) || 'Anonymous', amount(event.bits));
  if (type === 'channel.raid') return { ...base('raid', text(event.from_broadcaster_user_name), amount(event.viewers)), viewers: amount(event.viewers) };
  return null;
}

export function eventSubSubscriptions(broadcasterId: string, sessionId: string, scopes: readonly string[]) {
  const has = (scope: string) => scopes.includes(scope);
  const user = { type: 'webhook' as const, version: '1', condition: { broadcaster_user_id: broadcasterId }, transport: { method: 'websocket', session_id: sessionId } };
  const items: Array<Record<string, unknown>> = [{
    type: 'channel.raid',
    version: '1',
    condition: { to_broadcaster_user_id: broadcasterId },
    transport: { method: 'websocket', session_id: sessionId }
  }];
  if (has('moderator:read:followers')) {
    items.push({ type: 'channel.follow', version: '2', condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId }, transport: { method: 'websocket', session_id: sessionId } });
  }
  if (has('channel:read:subscriptions')) {
    items.push({ ...user, type: 'channel.subscribe' }, { ...user, type: 'channel.subscription.gift' }, { ...user, type: 'channel.subscription.message' });
  }
  if (has('bits:read')) items.push({ ...user, type: 'channel.cheer' });
  return items;
}
