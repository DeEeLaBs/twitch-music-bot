const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeDrm } = require('./drm.cjs');
test('stock runtime reports missing DRM', async () => {
  assert.deepEqual(await initializeDrm(undefined), { ready: false, reason: 'runtime-missing' });
});
test('waits for the Widevine component only', async () => {
  assert.deepEqual(await initializeDrm({ WIDEVINE_CDM_ID: 'widevine', whenReady: async ids => assert.deepEqual(ids, ['widevine']) }), { ready: true });
});
test('installation failure and stalled download do not prevent app startup', async () => {
  assert.deepEqual(await initializeDrm({ whenReady: async () => { throw Error('download'); } }), { ready: false, reason: 'installation-failed' });
  assert.deepEqual(await initializeDrm({ whenReady: () => new Promise(() => {}) }, 5), { ready: false, reason: 'timeout' });
});

test('the desktop opens only after Widevine readiness has completed', async () => {
  const { openDesktopAfterDrm } = require('./drm.cjs');
  const events = [];
  let complete;
  const pending = openDesktopAfterDrm({ WIDEVINE_CDM_ID: 'widevine', whenReady: () => new Promise(resolve => { complete = resolve; }) }, () => events.push('desktop'));
  assert.deepEqual(events, []);
  complete();
  await pending;
  assert.deepEqual(events, ['desktop']);
});

test('a DRM failure still opens the dashboard and reports the problem', async () => {
  const { openDesktopAfterDrm } = require('./drm.cjs');
  const events = [];
  await openDesktopAfterDrm({ whenReady: async () => { throw Error('offline'); } }, () => events.push('desktop'), result => events.push(result.reason));
  assert.deepEqual(events, ['installation-failed', 'desktop']);
});
