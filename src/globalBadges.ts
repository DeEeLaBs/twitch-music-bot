export interface GlobalBadgeVersion {
  id: string;
  title: string;
  image: string;
}

export interface GlobalBadgeSet {
  id: string;
  versions: GlobalBadgeVersion[];
}

const SET_ID = /^[a-z0-9_-]{1,40}$/;
const VERSION_ID = /^[a-z0-9_-]{1,24}$/;

export function parseGlobalBadges(body: unknown): GlobalBadgeSet[] {
  const rows = (body as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];
  const sets: GlobalBadgeSet[] = [];
  for (const row of rows.slice(0, 250)) {
    const id = typeof (row as { set_id?: unknown }).set_id === 'string' ? (row as { set_id: string }).set_id : '';
    const versions = (row as { versions?: unknown }).versions;
    if (!SET_ID.test(id) || !Array.isArray(versions)) continue;
    const parsed: GlobalBadgeVersion[] = [];
    for (const version of versions.slice(0, 40)) {
      const versionId = typeof (version as { id?: unknown }).id === 'string' ? (version as { id: string }).id : '';
      const title = typeof (version as { title?: unknown }).title === 'string' ? (version as { title: string }).title.slice(0, 80) : id;
      const image = badgeImage(version);
      if (!VERSION_ID.test(versionId) || !image) continue;
      parsed.push({ id: versionId, title, image });
    }
    if (parsed.length) sets.push({ id, versions: parsed });
  }
  return sets;
}

function badgeImage(version: unknown): string {
  const record = version as { image_url_2x?: unknown; image_url_1x?: unknown; image_url_4x?: unknown };
  for (const candidate of [record.image_url_2x, record.image_url_4x, record.image_url_1x]) {
    if (typeof candidate !== 'string') continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && url.hostname === 'static-cdn.jtvnw.net' && url.pathname.startsWith('/badges/')) return url.href;
    } catch { /* Ignore a badge URL Twitch did not host. */ }
  }
  return '';
}
