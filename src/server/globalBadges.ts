import { parseGlobalBadges, type GlobalBadgeSet } from '../globalBadges.ts';

const CACHE_MS = 60 * 60 * 1000;
let cache: { at: number; sets: GlobalBadgeSet[] } | null = null;

export async function getGlobalChatBadges(clientId: string, oauthToken: string): Promise<GlobalBadgeSet[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.sets;
  const token = oauthToken.trim().replace(/^oauth:/i, '');
  if (!clientId || !token) return cache?.sets || [];
  try {
    const response = await fetch('https://api.twitch.tv/helix/chat/badges/global', {
      headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return cache?.sets || [];
    const sets = parseGlobalBadges(await response.json());
    if (sets.length) cache = { at: Date.now(), sets };
    return sets;
  } catch {
    return cache?.sets || [];
  }
}
