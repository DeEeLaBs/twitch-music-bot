import { useSyncExternalStore } from 'react';
import type { GlobalBadgeSet, GlobalBadgeVersion } from '../globalBadges.ts';
import type { ChatBadge } from '../overlayChat.ts';

const CDN = 'https://static-cdn.jtvnw.net/badges/v1';

const SETS: Record<string, string> = {
  broadcaster: '5527c58c-fb7d-422d-b71b-f309dcb85cc1',
  moderator: '3267646d-33f0-4b17-b3df-f923a41db1d0',
  vip: 'b817aba4-fad8-49e2-b88a-7cc744dfa6ec',
  subscriber: '5d9f2208-5dd8-11e7-8513-2ff4adfae661',
  founder: '511b78a9-ab37-472f-9569-457753bbe7d3',
  premium: 'bbbe0db0-a598-423e-86d0-f9fb98ca1933',
  turbo: 'bd444ec6-8f34-4bf9-91f4-af1e3428d80f',
  partner: 'd12a2e27-16f6-41d0-ab77-b780518f00a3',
  staff: 'd97c37bd-a6f5-4c38-8f57-4e4bef88af34',
  admin: '9ef7e029-4cdf-4d4d-a0d5-e2b3fb2583fe',
  'artist-badge': '4300a897-03dc-4e83-8c0e-c332fee7057f',
  artist: '4300a897-03dc-4e83-8c0e-c332fee7057f'
};

const BITS: Array<[number, string]> = [
  [1, '73b5c3fb-24f9-4a82-a852-2f475b59411c'],
  [100, '09d93036-e7ce-431c-9a9e-7044297133f2'],
  [1000, '0d85a29e-79ad-4c63-a285-3acd2c66f2ba'],
  [5000, '57cd97fc-3e9e-4c6d-9d41-60147137234e'],
  [10000, '68af213b-a771-4124-b6e3-9bb6d98aa732'],
  [25000, '64ca5920-c663-4bd8-bfb1-751b4caea2dd'],
  [50000, '62310ba7-9916-4235-9eba-40110d67f85d'],
  [100000, '96f0540f-aa63-49e1-a8b3-259ece3bd098']
];

const GIFTS: Array<[number, string]> = [
  [1, 'f1d8486f-eb2e-4553-b44f-4d614617afc1'],
  [5, '3e638e02-b765-4070-81bd-a73d1ae34965'],
  [10, 'bffca343-9d7d-49b4-a1ca-90af2c6a1639'],
  [25, '17e09e26-2528-4a04-9c7f-8518348324d1'],
  [50, '47308ed4-c979-4f3f-ad20-35a8ab76d85d'],
  [100, '5056c366-7299-4b3c-a15a-a18573650bfb']
];

const LABELS: Record<string, string> = {
  broadcaster: 'Streamer',
  moderator: 'Mod',
  vip: 'VIP',
  subscriber: 'Sub',
  founder: 'Founder',
  premium: 'Prime',
  turbo: 'Turbo',
  bits: 'Bits',
  artist: 'Artist',
  'artist-badge': 'Artist',
  partner: 'Partner',
  staff: 'Staff',
  admin: 'Admin',
  'sub-gifter': 'Sub gift'
};

export function ChatBadgeRow({ badges }: { badges: readonly ChatBadge[] }) {
  const catalog = useBadgeCatalog();
  if (!badges.length) return null;
  return (
    <span className="overlay-chat-badges">
      {badges.map(badge => {
        const live = catalogArt(catalog, badge);
        const src = live?.image || badgeUrl(badge);
        if (!src) return null;
        const title = live?.title || badgeTitle(badge);
        return <img key={`${badge.set}/${badge.version}`} className="overlay-chat-badge" src={src} alt="" title={title} aria-label={title} decoding="async" />;
      })}
    </span>
  );
}

interface BadgeCatalog {
  sets: GlobalBadgeSet[];
  byKey: Map<string, GlobalBadgeVersion>;
}

const emptyCatalog: BadgeCatalog = { sets: [], byKey: new Map() };
let catalog = emptyCatalog;
let loadStarted = false;
const listeners = new Set<() => void>();

function useBadgeCatalog() {
  return useSyncExternalStore(subscribeBadges, () => catalog, () => emptyCatalog);
}

function subscribeBadges(listener: () => void) {
  listeners.add(listener);
  if (!loadStarted) {
    loadStarted = true;
    void loadBadgeCatalog();
  }
  return () => listeners.delete(listener);
}

async function loadBadgeCatalog() {
  try {
    const response = await fetch('/api/overlay/badges', { cache: 'no-store' });
    if (!response.ok) return;
    const body = await response.json() as { sets?: GlobalBadgeSet[] };
    const sets = Array.isArray(body.sets) ? body.sets : [];
    if (!sets.length) return;
    const byKey = new Map<string, GlobalBadgeVersion>();
    for (const set of sets) {
      for (const version of set.versions || []) byKey.set(`${set.id}/${version.id}`, version);
    }
    catalog = { sets, byKey };
    for (const listener of listeners) listener();
  } catch { /* The static badge map still paints the familiar roles. */ }
}

function catalogArt(current: BadgeCatalog, badge: ChatBadge): GlobalBadgeVersion | undefined {
  const exact = current.byKey.get(`${badge.set}/${badge.version}`);
  if (exact) return exact;
  const set = current.sets.find(item => item.id === badge.set);
  if (!set?.versions.length) return undefined;
  const amount = Number(badge.version);
  if (!Number.isFinite(amount)) return set.versions[0];
  let best = set.versions[0];
  let bestValue = Number(best.id);
  for (const version of set.versions) {
    const value = Number(version.id);
    if (!Number.isFinite(value) || value > amount) continue;
    if (!Number.isFinite(bestValue) || value >= bestValue) {
      best = version;
      bestValue = value;
    }
  }
  return best;
}

function badgeUrl(badge: ChatBadge): string {
  const id = badge.set === 'bits'
    ? tierId(BITS, badge.version)
    : badge.set === 'sub-gifter'
      ? tierId(GIFTS, badge.version)
      : SETS[badge.set];
  return id ? `${CDN}/${id}/2` : '';
}

function tierId(tiers: Array<[number, string]>, version: string): string {
  const amount = Number(version);
  const value = Number.isFinite(amount) && amount > 0 ? amount : 1;
  let id = tiers[0][1];
  for (const [tier, image] of tiers) {
    if (value >= tier) id = image;
  }
  return id;
}

function badgeTitle(badge: ChatBadge): string {
  const label = LABELS[badge.set] || badge.set;
  const amount = Number(badge.version);
  if ((badge.set === 'subscriber' || badge.set === 'founder' || badge.set === 'bits' || badge.set === 'sub-gifter') && Number.isInteger(amount) && amount > 1) {
    return `${label} · ${amount}`;
  }
  return label;
}
