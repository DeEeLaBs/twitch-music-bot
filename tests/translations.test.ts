import test from 'node:test';
import assert from 'node:assert/strict';
import { translations, useTranslations } from '../src/translations.ts';
import { twitchMessage } from '../src/server/twitchMessages.ts';

test('English and German UI translations have identical keys and placeholders', () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.de).sort());
  const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(translations.en) as Array<keyof typeof translations.en>) {
    assert.deepEqual(placeholders(translations.en[key]), placeholders(translations.de[key]), `Placeholder mismatch: ${key}`);
    assert.ok(translations.en[key].trim(), `Empty English translation: ${key}`);
    assert.ok(translations.de[key].trim(), `Empty German translation: ${key}`);
  }
});

test('visible playback and chat command texts use the selected language', () => {
  assert.equal(useTranslations('de')('playbackVoteButton'), '+1 Stimme');
  assert.equal(useTranslations('en')('playbackVoteButton'), '+1 Vote');
  assert.match(twitchMessage('de', 'vetoUsage', { user: 'Test' }), /Nutze/);
  assert.match(twitchMessage('en', 'vetoUsage', { user: 'Test' }), /Usage/);
});
