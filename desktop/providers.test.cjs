const test = require('node:test');
const assert = require('node:assert/strict');
const { providers, allowedNavigation, mediaPermission } = require('./providers.cjs');
test('provider homes and explicit sign-in entry points are allowed', () => {
  for (const [id, config] of Object.entries(providers)) {
    assert.equal(allowedNavigation(id, config.home), true);
    assert.equal(allowedNavigation(id, config.login), true);
  }
  assert.equal(allowedNavigation('youtube', 'https://www.youtube.com/signin?next=x'), true);
  assert.equal(allowedNavigation('youtube', providers.youtube.switchProfile), true);
});
test('login navigation rejects spoofed domains, local URLs and unexpected destinations', () => {
  for (const id of Object.keys(providers)) for (const url of [
    'https://accounts.google.com.evil.example/', 'https://accounts.google.com@evil.example/',
    'http://accounts.google.com/', 'https://accounts.google.com:444/',
    'file:///C:/secret', 'javascript:alert(1)', 'http://127.0.0.1:3000/', 'https://evil.example/'
  ]) assert.equal(allowedNavigation(id, url), false, url);
  assert.equal(allowedNavigation('youtube', 'https://www.youtube.com/accounts/SetSID'), true);
  assert.equal(allowedNavigation('youtube', 'https://accounts.youtube.com/accounts/SetSID'), true);
  assert.equal(allowedNavigation('youtube', 'https://www.youtube.com.evil.example/accounts/SetSID'), false);
  assert.equal(allowedNavigation('unknown', providers.youtube.home), false);
});
test('only playback origins can request DRM, never microphone or camera', () => {
  for (const [id, config] of Object.entries(providers)) {
    assert.equal(mediaPermission(id, 'mediaKeySystem', config.playbackOrigin), true);
    assert.equal(mediaPermission(id, 'mediaKeySystem', 'https://accounts.google.com'), false);
    assert.equal(mediaPermission(id, 'media', config.playbackOrigin), false);
    assert.equal(mediaPermission(id, 'notifications', config.playbackOrigin), false);
  }
});
