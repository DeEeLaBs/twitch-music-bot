import test from 'node:test';
import assert from 'node:assert/strict';
import { getStreamerAvatar } from '../src/server/streamerAvatarService.ts';

test('streamer avatar uses Twitch profile data when credentials are available', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, options: any) => {
    calls.push(input);
    assert.equal(options.headers['Client-Id'], 'client-id');
    assert.equal(options.headers.Authorization, 'Bearer token');
    return new Response(JSON.stringify({ data: [{ profile_image_url: 'https://static-cdn.jtvnw.net/avatar.png' }] }), { status: 200 });
  });
  assert.equal(await getStreamerAvatar('#avatar_official', 'client-id', 'oauth:token'), 'https://static-cdn.jtvnw.net/avatar.png');
  assert.equal(await getStreamerAvatar('avatar_official', 'client-id', 'oauth:token'), 'https://static-cdn.jtvnw.net/avatar.png');
  assert.equal(calls.length, 1);
});

test('streamer avatar falls back to public lookup and rejects invalid image URLs', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    calls.push(input);
    if (input.startsWith('https://api.twitch.tv/')) return new Response('{}', { status: 401 });
    return new Response('https://static-cdn.jtvnw.net/fallback.png', { status: 200 });
  });
  assert.equal(await getStreamerAvatar('avatar_public', 'client-id', 'expired'), 'https://static-cdn.jtvnw.net/fallback.png');
  assert.equal(calls.length, 2);
  assert.equal(await getStreamerAvatar('bad/channel'), null);
});
