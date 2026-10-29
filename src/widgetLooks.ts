/** Overlay label and effect looks stored in SceneWidget.variant.
 * A saved label source such as "follower" stays valid and uses the classic card.
 * Richer looks append "|design|accent|mark". Effects use "design|density|tint" or
 * "design|density|tint|emotes"; "" is confetti. Emote spam is off unless the fourth field is set.
 */

export const LABEL_SOURCES = ['follower', 'subscriber', 'cheerer', 'follows', 'viewers'] as const;
export const LABEL_DESIGNS = ['card', 'line', 'badge', 'glass', 'lower'] as const;
export const LABEL_ACCENTS = ['violet', 'amber', 'cyan', 'rose'] as const;
export const LABEL_MARKS = ['plain', 'bar', 'underline', 'glow'] as const;
export const FX_DESIGNS = ['confetti', 'embers', 'rings', 'burst', 'streaks', 'aurora', 'fireworks', 'snow', 'sparks'] as const;
export const FX_DENSITIES = ['sparse', 'medium', 'rich'] as const;
export const FX_TINTS = ['auto', 'gold', 'ice', 'ember', 'violet'] as const;
export const FX_EMOTES = ['off', 'rain', 'burst', 'parade'] as const;
export const FX_ALERT_KINDS = ['raid', 'cheer', 'gift'] as const;

export type LabelSource = typeof LABEL_SOURCES[number];
export type LabelDesign = typeof LABEL_DESIGNS[number];
export type LabelAccent = typeof LABEL_ACCENTS[number];
export type LabelMark = typeof LABEL_MARKS[number];
export type FxDesign = typeof FX_DESIGNS[number];
export type FxDensity = typeof FX_DENSITIES[number];
export type FxTint = typeof FX_TINTS[number];
export type FxEmotes = typeof FX_EMOTES[number];
export type FxAlertKind = typeof FX_ALERT_KINDS[number];

export interface LabelLook {
  source: LabelSource;
  design: LabelDesign;
  accent: LabelAccent;
  mark: LabelMark;
}

export interface FxLook {
  design: FxDesign;
  density: FxDensity;
  tint: FxTint;
  emotes: FxEmotes;
}

export const LABEL_ACCENT_COLORS: Record<LabelAccent, string> = {
  violet: '#c084fc',
  amber: '#fbbf24',
  cyan: '#22d3ee',
  rose: '#fb7185'
};

const FX_COUNTS: Record<FxDesign, Record<FxDensity, number>> = {
  confetti: { sparse: 10, medium: 18, rich: 28 },
  embers: { sparse: 8, medium: 14, rich: 22 },
  rings: { sparse: 3, medium: 5, rich: 8 },
  burst: { sparse: 4, medium: 7, rich: 11 },
  streaks: { sparse: 4, medium: 6, rich: 10 },
  aurora: { sparse: 3, medium: 5, rich: 7 },
  fireworks: { sparse: 8, medium: 14, rich: 20 },
  snow: { sparse: 8, medium: 14, rich: 22 },
  sparks: { sparse: 8, medium: 14, rich: 22 }
};

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? value as T : null;
}

export function defaultMark(design: LabelDesign): LabelMark {
  return design === 'card' ? 'plain' : 'bar';
}

export function parseLabelVariant(variant: string): LabelLook {
  const parts = variant.split('|').map(part => part.trim());
  const source = oneOf(parts[0], LABEL_SOURCES) ?? 'follower';
  const design = oneOf(parts[1], LABEL_DESIGNS) ?? 'card';
  const accent = oneOf(parts[2], LABEL_ACCENTS) ?? 'violet';
  const mark = oneOf(parts[3], LABEL_MARKS) ?? defaultMark(design);
  return { source, design, accent, mark };
}

export function formatLabelVariant(look: LabelLook): string {
  if (look.design === 'card' && look.accent === 'violet' && look.mark === 'plain') return look.source;
  return [look.source, look.design, look.accent, look.mark].join('|');
}

export function withLabelDesign(look: LabelLook, design: LabelDesign): LabelLook {
  const mark = look.mark === defaultMark(look.design) ? defaultMark(design) : look.mark;
  return { ...look, design, mark };
}

export const GOAL_KINDS = ['follower', 'sub'] as const;
export const GOAL_DESIGNS = ['bar', 'ring', 'steps', 'meter', 'banner'] as const;
export type GoalKind = typeof GOAL_KINDS[number];
export type GoalDesign = typeof GOAL_DESIGNS[number];

export interface GoalLook {
  kind: GoalKind;
  design: GoalDesign;
  accent: LabelAccent;
  /** `event` keeps the goal off the stream until an alert, then hides it again. */
  reveal: 'always' | 'event';
  holdSeconds: number;
}

function holdSeconds(value: string | undefined): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(120, Math.max(1, parsed));
}

export function parseGoalVariant(variant: string): GoalLook {
  const parts = variant.split('|').map(part => part.trim());
  return {
    kind: oneOf(parts[0], GOAL_KINDS) ?? 'follower',
    design: oneOf(parts[1], GOAL_DESIGNS) ?? 'bar',
    accent: oneOf(parts[2], LABEL_ACCENTS) ?? 'violet',
    reveal: parts[3] === 'event' ? 'event' : 'always',
    holdSeconds: holdSeconds(parts[4])
  };
}

export function formatGoalVariant(look: GoalLook): string {
  const reveal = look.reveal === 'event' ? 'event' : 'always';
  const hold = holdSeconds(String(look.holdSeconds));
  if (reveal === 'event') return [look.kind, look.design, look.accent, 'event', String(hold)].join('|');
  if (look.design === 'bar' && look.accent === 'violet') return look.kind;
  return [look.kind, look.design, look.accent].join('|');
}

export const BOARD_SOURCES = ['bits', 'requests'] as const;
export const BOARD_DESIGNS = ['list', 'bars', 'podium', 'cards', 'ladder'] as const;
export type BoardSource = typeof BOARD_SOURCES[number];
export type BoardDesign = typeof BOARD_DESIGNS[number];

export interface BoardLook {
  source: BoardSource;
  design: BoardDesign;
  accent: LabelAccent;
  rows: 3 | 5;
}

export function parseBoardVariant(variant: string): BoardLook {
  const parts = variant.split('|').map(part => part.trim());
  const rows = parts[3] === '3' ? 3 : 5;
  return {
    source: oneOf(parts[0], BOARD_SOURCES) ?? 'bits',
    design: oneOf(parts[1], BOARD_DESIGNS) ?? 'list',
    accent: oneOf(parts[2], LABEL_ACCENTS) ?? 'violet',
    rows
  };
}

export function formatBoardVariant(look: BoardLook): string {
  const rows = look.rows === 3 ? 3 : 5;
  if (look.design === 'list' && look.accent === 'violet' && rows === 5) return look.source;
  return [look.source, look.design, look.accent, String(rows)].join('|');
}

export function parseFxVariant(variant: string): FxLook {
  const parts = variant.split('|').map(part => part.trim()).filter(Boolean);
  return {
    design: oneOf(parts[0], FX_DESIGNS) ?? 'confetti',
    density: oneOf(parts[1], FX_DENSITIES) ?? 'medium',
    tint: oneOf(parts[2], FX_TINTS) ?? 'auto',
    emotes: oneOf(parts[3], FX_EMOTES) ?? 'off'
  };
}

export function formatFxVariant(look: FxLook): string {
  const emotes = look.emotes || 'off';
  if (look.design === 'confetti' && look.density === 'medium' && look.tint === 'auto' && emotes === 'off') return '';
  const base = [look.design, look.density, look.tint];
  return emotes === 'off' ? base.join('|') : [...base, emotes].join('|');
}

export function liveFxKind(kind: string | null | undefined): FxAlertKind | null {
  return oneOf(kind ?? undefined, FX_ALERT_KINDS);
}

export function fxShouldShow(input: { alertKind?: string | null; preview?: boolean; selected?: boolean }): boolean {
  return Boolean(liveFxKind(input.alertKind) || input.preview || input.selected);
}

export function fxParticleCount(look: FxLook): number {
  return FX_COUNTS[look.design][look.density];
}

export function fxParticleStyle(design: FxDesign, index: number): { left?: string; top?: string; width?: string; height?: string; animationDelay: string; ['--fx-dx']?: string; ['--fx-dy']?: string } {
  const animationDelay = `${((index * 0.17) % 2.1).toFixed(2)}s`;
  if (design === 'fireworks') {
    const angle = (index * 47) % 360;
    const distance = 36 + (index % 5) * 16;
    const radians = angle * Math.PI / 180;
    const origins = [
      { left: '30%', top: '42%' },
      { left: '68%', top: '48%' },
      { left: '48%', top: '30%' }
    ];
    return {
      ...origins[index % origins.length],
      animationDelay: `${(index * 0.11).toFixed(2)}s`,
      '--fx-dx': `${Math.cos(radians) * distance}px`,
      '--fx-dy': `${Math.sin(radians) * distance}px`
    };
  }
  if (design === 'rings') {
    const size = 140 + (index % 5) * 56;
    return { left: '50%', top: '50%', width: `${size}px`, height: `${size}px`, animationDelay: `${(index * 0.34).toFixed(2)}s` };
  }
  if (design === 'burst') {
    const size = 110 + (index % 4) * 48;
    return {
      left: `${16 + ((index * 19) % 62)}%`,
      top: `${14 + ((index * 27) % 64)}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDelay: `${(index * 0.24).toFixed(2)}s`
    };
  }
  if (design === 'streaks') {
    return { left: '0', top: `${10 + ((index * 17) % 76)}%`, animationDelay };
  }
  return { left: `${(index * 17 + 4) % 96}%`, animationDelay };
}

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export const TEXT_WEIGHTS = ['regular', 'bold'] as const;

export interface TextLook {
  text: string;
  color: string;
  align: typeof TEXT_ALIGNS[number];
  weight: typeof TEXT_WEIGHTS[number];
  shadow: boolean;
}

export interface MediaLook {
  src: string;
  /** Empty leaves the picture untouched. */
  key: string;
  amount: number;
  sound: boolean;
}

const DEFAULT_TEXT: TextLook = { text: 'Text', color: '#ffffff', align: 'center', weight: 'bold', shadow: true };

function cssColor(value: unknown): string {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : '';
}

export function parseTextVariant(variant: string): TextLook {
  if (!variant.trim()) return { ...DEFAULT_TEXT };
  try {
    const raw = JSON.parse(variant) as Partial<TextLook>;
    return {
      text: String(raw.text ?? DEFAULT_TEXT.text).slice(0, 240),
      color: cssColor(raw.color) || DEFAULT_TEXT.color,
      align: TEXT_ALIGNS.includes(raw.align as TextLook['align']) ? raw.align as TextLook['align'] : 'center',
      weight: raw.weight === 'regular' ? 'regular' : 'bold',
      shadow: raw.shadow !== false
    };
  } catch {
    return { ...DEFAULT_TEXT, text: variant.slice(0, 240) };
  }
}

export function formatTextVariant(look: TextLook): string {
  const next = parseTextVariant(JSON.stringify(look));
  if (next.text === DEFAULT_TEXT.text && next.color === DEFAULT_TEXT.color && next.align === DEFAULT_TEXT.align && next.weight === DEFAULT_TEXT.weight && next.shadow) return '';
  return JSON.stringify(next);
}

export function parseMediaVariant(variant: string): MediaLook {
  if (!variant.startsWith('{')) return { src: variant.slice(0, 400), key: '', amount: 32, sound: false };
  try {
    const raw = JSON.parse(variant) as Partial<MediaLook>;
    const amount = Number(raw.amount);
    return {
      src: String(raw.src || '').slice(0, 400),
      key: cssColor(raw.key),
      amount: Number.isFinite(amount) ? Math.min(80, Math.max(8, Math.round(amount))) : 32,
      sound: raw.sound === true
    };
  } catch {
    return { src: '', key: '', amount: 32, sound: false };
  }
}

export function formatMediaVariant(look: MediaLook): string {
  const next = parseMediaVariant(JSON.stringify(look));
  if (!next.key && !next.sound) return next.src;
  return JSON.stringify(next);
}
