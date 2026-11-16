export const QUIZ_SOUNDS = ['question', 'countdown', 'reveal', 'success', 'failure', 'joker', 'complete'] as const;
export type QuizSound = typeof QUIZ_SOUNDS[number];
export type QuizJoker = 'fifty' | 'time' | 'swap';
export interface QuizShowSettings {
  enabled: boolean;
  design: 'classic' | 'show';
  volume: number;
  muted: boolean;
  sounds: Partial<Record<QuizSound, string>>;
}
export interface QuizShowProgress {
  level: number;
  used: string[];
  jokers: QuizJoker[];
}
export interface QuizShowOutput extends QuizShowProgress {
  design: 'classic' | 'show';
  sound: QuizShowSettings;
  event?: { id: string; at: number; kind: QuizSound };
}
export const DEFAULT_QUIZ_SHOW: QuizShowSettings = {enabled:false, design:'classic', volume:60, muted:false, sounds:{}};
export const freshQuizShow = (): QuizShowProgress => ({level:0, used:[], jokers:[]});
export function validateQuizShow(raw: unknown): QuizShowSettings {
  if (raw === undefined) return structuredClone(DEFAULT_QUIZ_SHOW);
  const value = raw as QuizShowSettings;
  if (!value || typeof value.enabled !== 'boolean' || typeof value.muted !== 'boolean' || !['classic','show'].includes(value.design) || !Number.isInteger(value.volume) || value.volume < 0 || value.volume > 100 || !value.sounds || typeof value.sounds !== 'object') throw Error('Ungültige Quizshow-Einstellungen.');
  const sounds: QuizShowSettings['sounds'] = {};
  for (const kind of QUIZ_SOUNDS) {
    const url = value.sounds[kind];
    if (url !== undefined) {
      if (typeof url !== 'string' || !/^\/overlay-assets\/[a-zA-Z0-9_-]+\.(mp3|wav|ogg|webm|m4a)$/.test(url)) throw Error('Ungültige Sounddatei.');
      sounds[kind] = url;
    }
  }
  return {...value, sounds};
}
