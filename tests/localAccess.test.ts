import assert from 'node:assert/strict';
import test from 'node:test';
import { isLocalDashboardRequest } from '../src/server/localAccess.ts';

const local = (headers: Record<string, string>) => isLocalDashboardRequest({ headers: { host: '127.0.0.1:3000', ...headers } });

test('the OBS dock navigation is allowed when CEF sends a null origin', () => {
  assert.equal(local({ origin: 'null', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site' }), true);
});

test('a cross-site API call to the local bot is refused', () => {
  assert.equal(local({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }), false);
  assert.equal(isLocalDashboardRequest({ headers: { host: 'evil.example', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } }), false);
});

test('the dock websocket is allowed from a local page with a null origin', () => {
  assert.equal(local({ origin: 'null', upgrade: 'websocket' }), true);
  assert.equal(local({ origin: 'http://127.0.0.1:3000' }), true);
});
