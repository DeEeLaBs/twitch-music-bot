import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, commandDefaultAllows } from '../src/server/commandRegistry.ts';
import { twitchMessage, localizeCompanionError } from '../src/server/twitchMessages.ts';

test('command registry resolves aliases, args and default permissions', () => {
  const request = parseCommand('!songrequest Artist - Track');
  assert.equal(request?.definition.name, 'sr');
  assert.equal(request?.args, 'Artist - Track');
  assert.equal(parseCommand('!np')?.definition.name, 'song');
  const skip = parseCommand('!skip')!;
  assert.equal(commandDefaultAllows(skip.definition, 'viewer'), false);
  assert.equal(commandDefaultAllows(skip.definition, 'moderator'), true);
});

test('twitch chat i18n keeps command/runtime responses language-aware', () => {
  assert.match(twitchMessage('de', 'volBounds', { user: 'Test' }), /zwischen 0 und 100/);
  assert.match(twitchMessage('en', 'volBounds', { user: 'Test' }), /between 0 and 100/);
  assert.match(localizeCompanionError('en', 'Begleitserver: Zu viele Anfragen. Bitte kurz warten.'), /too many requests/i);
  assert.match(localizeCompanionError('de', 'Begleitserver: Zu viele Anfragen. Bitte kurz warten.'), /Zu viele Anfragen/);
});
