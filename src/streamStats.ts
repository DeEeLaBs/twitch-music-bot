import type { StreamAlert } from './streamAlerts.ts';

export interface StatPerson { user: string; at: number; amount: number }
export interface StatGoal { current: number; target: number }
export interface StatRow { user: string; value: number }

export interface StreamStats {
  version: 1;
  sessionStartedAt: number;
  monthKey: string;
  latest: { follower?: StatPerson; subscriber?: StatPerson; cheerer?: StatPerson };
  session: { follows: number; subs: number; gifts: number; cheers: number; bits: number; raids: number };
  month: { follows: number; subs: number; bits: number };
  goals: { follower: StatGoal; sub: StatGoal };
  cheers: StatRow[];
  requesters: StatRow[];
  viewers: number;
  timerEndsAt: number;
}

function monthKey(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function emptyStats(now = Date.now()): StreamStats {
  return {
    version: 1,
    sessionStartedAt: now,
    monthKey: monthKey(now),
    latest: {},
    session: { follows: 0, subs: 0, gifts: 0, cheers: 0, bits: 0, raids: 0 },
    month: { follows: 0, subs: 0, bits: 0 },
    goals: { follower: { current: 0, target: 100 }, sub: { current: 0, target: 10 } },
    cheers: [],
    requesters: [],
    viewers: 0,
    timerEndsAt: 0
  };
}

function bump(rows: StatRow[], user: string, by: number): StatRow[] {
  const name = user.trim();
  if (!name || by <= 0) return rows;
  const next = rows.map(row => ({ ...row }));
  const found = next.find(row => row.user.toLowerCase() === name.toLowerCase());
  if (found) found.value += by;
  else next.push({ user: name, value: by });
  return next.sort((a, b) => b.value - a.value).slice(0, 20);
}

export function applyAlert(stats: StreamStats, alert: StreamAlert, now = alert.createdAt): StreamStats {
  const next = structuredClone(stats);
  if (next.monthKey !== monthKey(now)) {
    next.monthKey = monthKey(now);
    next.month = { follows: 0, subs: 0, bits: 0 };
  }
  const person = { user: alert.user, at: now, amount: alert.amount };
  if (alert.kind === 'follow') {
    next.session.follows += 1;
    next.month.follows += 1;
    next.goals.follower.current += 1;
    next.latest.follower = person;
  } else if (alert.kind === 'subscription' || alert.kind === 'resub') {
    next.session.subs += 1;
    next.month.subs += 1;
    next.goals.sub.current += 1;
    next.latest.subscriber = person;
  } else if (alert.kind === 'gift' || alert.kind === 'communitygift') {
    const count = Math.max(1, alert.amount);
    next.session.gifts += count;
    next.session.subs += count;
    next.month.subs += count;
    next.goals.sub.current += count;
    next.latest.subscriber = person;
  } else if (alert.kind === 'cheer') {
    next.session.cheers += 1;
    next.session.bits += alert.amount;
    next.month.bits += alert.amount;
    next.latest.cheerer = person;
    next.cheers = bump(next.cheers, alert.user, alert.amount);
  } else if (alert.kind === 'raid') {
    next.session.raids += 1;
    next.viewers = Math.max(next.viewers, alert.amount);
  }
  return next;
}

export function noteRequester(stats: StreamStats, user: string): StreamStats {
  return { ...stats, requesters: bump(stats.requesters, user, 1) };
}

export function noteViewers(stats: StreamStats, viewers: number): StreamStats {
  return { ...stats, viewers: Math.max(0, Math.round(viewers) || 0) };
}

export function setGoal(stats: StreamStats, kind: 'follower' | 'sub', target: number): StreamStats {
  const next = structuredClone(stats);
  next.goals[kind].target = Math.max(1, Math.min(1_000_000, Math.round(target) || 1));
  return next;
}

export function normalizeStats(input: unknown): StreamStats {
  const empty = emptyStats();
  if (!input || typeof input !== 'object') return empty;
  const raw = input as Partial<StreamStats>;
  const number = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
  };
  const rows = (value: unknown): StatRow[] => Array.isArray(value)
    ? value.map(item => ({ user: String((item as StatRow).user || '').slice(0, 40), value: number((item as StatRow).value) })).filter(item => item.user).slice(0, 20)
    : [];
  return {
    ...empty,
    sessionStartedAt: number(raw.sessionStartedAt, empty.sessionStartedAt),
    monthKey: /^\d{4}-\d{2}$/.test(String(raw.monthKey || '')) ? String(raw.monthKey) : empty.monthKey,
    latest: raw.latest && typeof raw.latest === 'object' ? raw.latest : {},
    session: { ...empty.session, ...raw.session },
    month: { ...empty.month, ...raw.month },
    goals: {
      follower: { current: number(raw.goals?.follower?.current), target: Math.max(1, number(raw.goals?.follower?.target, 100)) },
      sub: { current: number(raw.goals?.sub?.current), target: Math.max(1, number(raw.goals?.sub?.target, 10)) }
    },
    cheers: rows(raw.cheers),
    requesters: rows(raw.requesters),
    viewers: number(raw.viewers),
    timerEndsAt: number(raw.timerEndsAt)
  };
}
