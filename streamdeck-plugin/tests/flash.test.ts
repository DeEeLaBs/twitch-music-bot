import test from 'node:test';
import assert from 'node:assert/strict';
import { FlashTracker } from '../src/core/flash.ts';

test('a key flashes for the configured time after a successful press, then stops', () => {
  const flash = new FlashTracker(200);
  assert.equal(flash.isActive('a', 0), false);
  flash.trigger('a', 1000);
  assert.equal(flash.isActive('a', 1000), true);
  assert.equal(flash.isActive('a', 1199), true);
  assert.equal(flash.isActive('a', 1200), false);
});

test('flashes are per key', () => {
  const flash = new FlashTracker(200);
  flash.trigger('a', 1000);
  assert.equal(flash.isActive('b', 1050), false);
});

test('pressing again while flashing restarts the flash instead of cutting it short', () => {
  const flash = new FlashTracker(200);
  flash.trigger('a', 1000);
  flash.trigger('a', 1150);
  assert.equal(flash.isActive('a', 1300), true);
  assert.equal(flash.isActive('a', 1350), false);
});

test('clear stops a flash right away', () => {
  const flash = new FlashTracker(200);
  flash.trigger('a', 1000);
  flash.clear('a');
  assert.equal(flash.isActive('a', 1010), false);
});
