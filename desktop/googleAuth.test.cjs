const test = require('node:test');
const assert = require('node:assert/strict');
const { LOGIN_URL, findBrowser, hasGoogleLogin, importGoogleCookies, isAllowedCookieDomain, isGoogleLoginComplete, resolveLoginUrl, toElectronCookie } = require('./googleAuth.cjs');

test('browser discovery prefers Chrome and falls back to Edge', () => {
  const env = { PROGRAMFILES: 'C:\\Programs', LOCALAPPDATA: 'C:\\Local' };
  assert.match(findBrowser(env, value => value.endsWith('Google\\Chrome\\Application\\chrome.exe')), /Chrome/);
  assert.match(findBrowser(env, value => value.endsWith('Microsoft\\Edge\\Application\\msedge.exe')), /Edge/);
  assert.equal(findBrowser(env, () => false), null);
});

test('only Google and YouTube cookie domains are accepted', () => {
  assert.equal(isAllowedCookieDomain('.youtube.com'), true);
  assert.equal(isAllowedCookieDomain('accounts.google.com'), true);
  assert.equal(isAllowedCookieDomain('youtube.com.evil.example'), false);
  assert.equal(toElectronCookie({ domain: '.evil.example', name: 'SID', value: 'secret' }), null);
});

test('CDP cookies are converted without losing security attributes', () => {
  assert.deepEqual(toElectronCookie({ domain: '.youtube.com', path: '/', name: 'SID', value: 'x', secure: true, httpOnly: true, sameSite: 'None', expires: 123 }), {
    url: 'https://youtube.com/', name: 'SID', value: 'x', domain: '.youtube.com', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction', expirationDate: 123
  });
});

test('login detection requires a real authentication cookie', () => {
  assert.equal(hasGoogleLogin([{ domain: '.google.com', name: 'NID', value: 'x' }]), false);
  assert.equal(hasGoogleLogin([{ domain: '.google.com', name: '__Secure-3PSID', value: 'x' }]), true);
});

test('login URL accepts only real Google account origins', () => {
  assert.equal(resolveLoginUrl('https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmusic.youtube.com'), 'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmusic.youtube.com');
  assert.equal(resolveLoginUrl('https://accounts.youtube.com/accounts/SetSID'), 'https://accounts.youtube.com/accounts/SetSID');
  assert.equal(resolveLoginUrl('https://accounts.google.com.evil.example/login'), LOGIN_URL);
  assert.equal(resolveLoginUrl('file:///C:/secret'), LOGIN_URL);
});

test('login completes only after Google redirects the authenticated browser to YouTube Music', () => {
  const cookies = [{ domain: '.google.com', name: 'SID', value: 'signed-in' }];
  assert.equal(isGoogleLoginComplete(cookies, 'https://accounts.google.com/v3/signin/challenge'), false);
  assert.equal(isGoogleLoginComplete(cookies, 'https://music.youtube.com/'), true);
  assert.equal(isGoogleLoginComplete([], 'https://music.youtube.com/'), false);
});

test('account switch replaces old Google and YouTube cookies but leaves other sessions alone', async () => {
  const saved = [
    { domain: '.google.com', path: '/', name: 'SID', value: 'old', secure: true },
    { domain: '.youtube.com', path: '/', name: 'LOGIN_INFO', value: 'old', secure: true },
    { domain: '.spotify.com', path: '/', name: 'session', value: 'spotify', secure: true }
  ];
  const cookies = {
    get: async () => [...saved],
    remove: async (url, name) => { const index = saved.findIndex(cookie => cookie.name === name && url.includes(cookie.domain.replace(/^\./, ''))); if (index >= 0) saved.splice(index, 1); },
    set: async cookie => { saved.push(cookie); }
  };
  await importGoogleCookies({ cookies }, [toElectronCookie({ domain: '.google.com', path: '/', name: 'SID', value: 'new', secure: true })], true);
  assert.equal(saved.some(cookie => cookie.value === 'old'), false);
  assert.equal(saved.some(cookie => cookie.value === 'spotify'), true);
  assert.equal(saved.some(cookie => cookie.value === 'new'), true);
});
