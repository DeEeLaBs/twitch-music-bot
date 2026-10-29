/**
 * Text song requests ("title", "artist - title", "title by artist").
 * Link requests stay on the URL parsers and never go through this planner.
 * Spotify treats a bare "-" as NOT, so "Artist - Title" must be rewritten
 * before it is sent to the Web API.
 */

export interface TextMatchFields {
  title: string;
  artist: string;
}

export interface TextSearchPlan {
  scoringQuery: string;
  titleHint?: string;
  artistHint?: string;
  spotifyQueries: string[];
  textQueries: string[];
}

export interface TextMatchHints {
  title?: string;
  artist?: string;
}

const LEADING_FILLER = /^(?:(?:please|bitte)\s+)?(?:play|spiele?|songrequest|request)\s+/i;
const TRAILING_FILLER = /\s+(?:please|thanks|thank you|bitte|danke|thx)$/i;
const STOPWORDS = new Set(['the', 'and', 'a', 'an', 'of', 'und', 'der', 'die', 'das', 'by', 'vs', 'pt', 'part', 'feat', 'ft', 'featuring', 'official', 'audio', 'video', 'lyrics', 'lyric', 'music', 'topic', 'hd', 'hq', 'mv', 'amv', 'remaster', 'remastered', 'visualizer', 'visualiser']);

function unique(values: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

export function neutralizeSearchOperators(value: string): string {
  return value
    .replace(/[“”«»]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/\s+[-–—/|]+\s+/g, ' ')
    .replace(/(^|\s)-+/g, '$1')
    .replace(/["*+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanRequestText(input: string): string {
  let value = input.trim();
  for (let pass = 0; pass < 3; pass++) {
    const next = value.replace(LEADING_FILLER, '').replace(TRAILING_FILLER, '').trim();
    if (next === value) break;
    value = next;
  }
  return value;
}

function sideOk(value: string): boolean {
  return value.length >= 2 && !/https?:\/\//i.test(value) && !/youtube\.com|youtu\.be|open\.spotify\.com/i.test(value);
}

function splitArtistTitle(value: string): { artist?: string; title?: string } {
  const by = /^(.+?)\s+by\s+(.+)$/i.exec(value);
  if (by) {
    const title = by[1].trim();
    const artist = by[2].trim();
    if (sideOk(title) && sideOk(artist) && artist.split(/\s+/).some(part => part.length >= 3)) return { title, artist };
  }
  const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(value);
  if (dash) {
    const left = dash[1].trim();
    const right = dash[2].trim();
    const longEnough = `${left} ${right}`.split(/\s+/).some(part => part.length >= 3);
    if (sideOk(left) && sideOk(right) && longEnough) return { artist: left, title: right };
  }
  return {};
}

function quoteSpotify(value: string): string {
  const cleaned = neutralizeSearchOperators(value).replace(/["\\]/g, '').trim();
  return `"${cleaned}"`;
}

function looseText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function prepareTextSearch(raw: string): TextSearchPlan {
  const cleaned = cleanRequestText(raw);
  const split = splitArtistTitle(cleaned);
  const scoringQuery = neutralizeSearchOperators(split.artist && split.title ? `${split.artist} ${split.title}` : cleaned);
  const title = split.title ? neutralizeSearchOperators(split.title) : '';
  const artist = split.artist ? neutralizeSearchOperators(split.artist) : '';
  const loose = looseText(scoringQuery);
  const spotifyQueries = unique([
    artist && title ? `track:${quoteSpotify(title)} artist:${quoteSpotify(artist)}` : '',
    scoringQuery,
    loose.toLowerCase() === scoringQuery.toLowerCase() ? '' : loose,
    title && title.toLowerCase() !== scoringQuery.toLowerCase() ? title : ''
  ], 4);
  const textQueries = unique([
    scoringQuery,
    loose.toLowerCase() === scoringQuery.toLowerCase() ? '' : loose,
    title && title.toLowerCase() !== scoringQuery.toLowerCase() ? title : ''
  ], 3);
  return {
    scoringQuery,
    titleHint: title || undefined,
    artistHint: artist || undefined,
    spotifyQueries,
    textQueries
  };
}

export function normalizeMatchText(value: string): string {
  return value.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/\b(official|audio|video|lyrics?|music)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokensOf(value: string): string[] {
  return normalizeMatchText(value).split(' ').filter(Boolean);
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle || needle.length < 3) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function hintCoverage(hint: string | undefined, value: string): number {
  if (!hint) return 0;
  const hintTokens = tokensOf(hint).filter(token => token.length >= 2 && !STOPWORDS.has(token));
  if (!hintTokens.length) return 0;
  const valueTokens = new Set(tokensOf(value));
  return hintTokens.filter(token => valueTokens.has(token)).length / hintTokens.length;
}

export function judgeTextMatch(query: string, title: string, artist: string, hints?: TextMatchHints): { score: number; acceptable: boolean } {
  const q = normalizeMatchText(query);
  const t = normalizeMatchText(title);
  const a = normalizeMatchText(artist);
  const combined = `${a} ${t}`.trim();
  if (!q || !t) return { score: 0, acceptable: false };

  const queryTokens = q.split(' ').filter(Boolean);
  const considered = queryTokens.filter(token => token.length >= 3 && !STOPWORDS.has(token));
  const overlapTokens = considered.length ? considered : queryTokens.filter(token => token.length >= 2);
  const titleTokens = new Set(t.split(' ').filter(Boolean));
  const artistTokens = new Set(a.split(' ').filter(Boolean));
  const combinedTokens = new Set(combined.split(' ').filter(Boolean));

  let score = 0;
  if (t === q || combined === q || `${t} ${a}`.trim() === q) score += 100;
  if (containsPhrase(q, t)) score += 35;
  if (containsPhrase(t, q)) score += 30;
  if (containsPhrase(q, a) && a.length > 2) score += 24;

  let titleHits = 0;
  for (const token of overlapTokens) {
    if (titleTokens.has(token)) { score += 8; titleHits++; }
    else if (artistTokens.has(token)) score += 6;
  }

  if (hintCoverage(hints?.title, title) >= 0.66) score += 40;
  if (hintCoverage(hints?.artist, artist) >= 0.66) score += 20;

  const noisy = /\b(live|cover|karaoke|remix|sped up|slowed|nightcore|instrumental|reaction)\b/.test(`${t} ${a}`);
  const wantsVariant = /\b(live|cover|karaoke|remix|sped up|slowed|nightcore|instrumental)\b/.test(q);
  if (noisy && !wantsVariant) score -= 35;

  const hits = overlapTokens.filter(token => combinedTokens.has(token)).length;
  const ratio = overlapTokens.length ? hits / overlapTokens.length : 0;
  let acceptable = t === q || combined === q || `${t} ${a}`.trim() === q;
  if (!acceptable && overlapTokens.length === 1) acceptable = titleTokens.has(overlapTokens[0]) || artistTokens.has(overlapTokens[0]);
  if (!acceptable && overlapTokens.length >= 2 && ratio >= 0.66 && titleHits >= 1) acceptable = true;
  if (acceptable && overlapTokens.length >= 2 && titleHits === 0) acceptable = false;
  return { score, acceptable };
}

export function pickTextMatch<T extends TextMatchFields>(query: string, candidates: T[], hints?: TextMatchHints): T | null {
  let best: { item: T; score: number } | null = null;
  for (const item of candidates) {
    const judged = judgeTextMatch(query, item.title, item.artist, hints);
    if (!judged.acceptable) continue;
    if (!best || judged.score > best.score) best = { item, score: judged.score };
  }
  return best?.item ?? null;
}
