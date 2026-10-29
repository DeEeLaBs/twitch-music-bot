import test from 'node:test';
import assert from 'node:assert/strict';
import { describeStreamDeck, shortVersion, type StreamDeckState } from '../src/streamDeckText.ts';

const status = (state: StreamDeckState, bundledVersion: string | null = '1.2.0.0', installedVersion: string | null = null) => ({ state, bundledVersion, installedVersion });

test('shortVersion hides the trailing .0 of Stream Deck versions only', () => {
  assert.equal(shortVersion('1.2.0.0'), '1.2.0');
  assert.equal(shortVersion('1.2.0.3'), '1.2.0.3');
  assert.equal(shortVersion(null), '');
});

test('only states with something to install offer a button', () => {
  const actions = Object.fromEntries((['not-bundled', 'streamdeck-missing', 'not-installed', 'update-available', 'up-to-date'] as const)
    .map(state => [state, describeStreamDeck(status(state, '1.2.0.0', '1.1.0.0'), 'en').action]));
  assert.deepEqual(actions, {
    'not-bundled': null,
    'streamdeck-missing': null,
    'not-installed': 'Install in Stream Deck',
    'update-available': 'Update plugin',
    'up-to-date': 'Reinstall'
  });
});

test('the update hint names both versions and is flagged as a warning', () => {
  const view = describeStreamDeck(status('update-available', '1.2.0.0', '1.1.0.0'), 'de');
  assert.equal(view.tone, 'warn');
  assert.equal(view.badge, 'Update verfügbar');
  assert.match(view.message, /1\.1\.0/);
  assert.match(view.message, /1\.2\.0/);
});

test('up to date is the only green state, and both languages are provided', () => {
  for (const state of ['not-bundled', 'streamdeck-missing', 'not-installed', 'update-available', 'up-to-date'] as const) {
    const de = describeStreamDeck(status(state, '1.2.0.0', '1.2.0.0'), 'de');
    const en = describeStreamDeck(status(state, '1.2.0.0', '1.2.0.0'), 'en');
    assert.notEqual(de.message, en.message, state);
    assert.notEqual(de.badge, en.badge, state);
    assert.equal(de.tone === 'ok', state === 'up-to-date', state);
  }
});
