import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptChatLine, applyChatClear, badgeFromIrc, chatFromParams, chatPresence, chatSearchParams, DEFAULT_CHAT_OPTIONS, normalizeChat, parseIrcBadges, parseTwitchEmoteTag, pushChatLine, segmentChat, visibleChatLines, type OverlayChatLine } from '../src/overlayChat.ts';
import { createOverlaySearch, DEFAULT_OVERLAY_OPTIONS, parseOverlayOptions } from '../src/overlayOptions.ts';
import { chatLineFromPrivmsg, parseClear, parsePrivmsg } from '../src/server/twitchIrc.ts';
import { add7tvEmotes, addBttvEmotes, addFfzEmotes } from '../src/server/chatEmotes.ts';
import { parseGlobalBadges } from '../src/globalBadges.ts';
import { tokensMatch } from '../src/server/overlayAccess.ts';

const line = (partial: Partial<OverlayChatLine> & Pick<OverlayChatLine, 'id' | 'text'>): OverlayChatLine => ({
  userId: partial.userId || partial.id,
  login: partial.login || 'viewer',
  displayName: partial.displayName || 'Viewer',
  color: partial.color || '',
  badge: partial.badge || 'viewer',
  badges: partial.badges || [],
  emotes: partial.emotes || [],
  bits: partial.bits || 0,
  replyTo: partial.replyTo || '',
  replyText: partial.replyText || '',
  first: partial.first || false,
  ts: partial.ts || 1_000,
  ...partial
});

test('twitch emote tag keeps source order and ignores broken pairs', () => {
  assert.deepEqual(parseTwitchEmoteTag('25:6-10,0-4/1902:12-16'), [
    { id: '25', start: 6, end: 10 },
    { id: '25', start: 0, end: 4 },
    { id: '1902', start: 12, end: 16 }
  ].sort((a, b) => a.start - b.start));
  assert.deepEqual(parseTwitchEmoteTag('nope'), []);
});

test('privmsg becomes a compact chat line and clear commands do not match chat text', () => {
  const raw = '@badges=moderator/1;color=#00FF00;display-name=ModUser;emotes=25:0-4;id=msg-1;room-id=42;user-id=7;tmi-sent-ts=1000 :moduser!moduser@moduser.tmi.twitch.tv PRIVMSG #mychan :Kappa hi';
  const parsed = parsePrivmsg(raw);
  assert.ok(parsed);
  assert.deepEqual(chatLineFromPrivmsg(parsed, 'mychan'), {
    id: 'msg-1', userId: '7', login: 'moduser', displayName: 'ModUser', color: '#00FF00', badge: 'moderator', badges: [{ set: 'moderator', version: '1' }], text: 'Kappa hi', emotes: [{ id: '25', start: 0, end: 4 }], bits: 0, replyTo: '', replyText: '', first: false, ts: 1000
  });
  const reply = parsePrivmsg('@badges=subscriber/12,premium/1;bits=100;first-msg=1;reply-parent-display-name=ModUser;reply-parent-msg-body=hello\\sthere;display-name=Fan;id=msg-2;user-id=9;tmi-sent-ts=2000 :fan!fan@fan.tmi.twitch.tv PRIVMSG #mychan :cheer100 hi');
  assert.ok(reply);
  const replied = chatLineFromPrivmsg(reply, 'mychan');
  assert.equal(replied?.badge, 'subscriber');
  assert.deepEqual(replied?.badges, [{ set: 'subscriber', version: '12' }, { set: 'premium', version: '1' }]);
  assert.equal(replied?.bits, 100);
  assert.equal(replied?.first, true);
  assert.equal(replied?.replyTo, 'ModUser');
  assert.equal(replied?.replyText, 'hello there');
  assert.deepEqual(parseIrcBadges('vip/1,subscriber/6, ,bogus tag'), [{ set: 'vip', version: '1' }, { set: 'subscriber', version: '6' }]);
  assert.equal(badgeFromIrc('founder/1', 'fan', 'mychan'), 'subscriber');
  assert.equal(badgeFromIrc('subscriber/6', 'mychan', '#mychan'), 'broadcaster');
  assert.deepEqual(parseClear('@target-user-id=7 :tmi.twitch.tv CLEARCHAT #mychan :moduser'), { scope: 'user', userId: '7' });
  assert.deepEqual(parseClear(':tmi.twitch.tv CLEARCHAT #mychan'), { scope: 'all' });
  assert.deepEqual(parseClear('@target-msg-id=msg-1 :tmi.twitch.tv CLEARMSG #mychan :Kappa hi'), { scope: 'message', messageId: 'msg-1' });
  assert.equal(parseClear(':viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #mychan :please CLEARCHAT now'), null);
});

test('filters drop commands, roles, words, and users before paint', () => {
  const options = { ...DEFAULT_CHAT_OPTIONS, enabled: true, hideCommands: true, roleFilter: 'vip' as const, blockWords: ['spam'], blockUsers: ['noisy'] };
  assert.equal(acceptChatLine(line({ id: '1', text: '!sr song', badge: 'vip' }), options), false);
  assert.equal(acceptChatLine(line({ id: '2', text: 'hello', badge: 'subscriber' }), options), false);
  assert.equal(acceptChatLine(line({ id: '3', text: 'hello', badge: 'broadcaster' }), options), true);
  assert.equal(acceptChatLine(line({ id: '4', text: 'this is Spam', badge: 'vip' }), options), false);
  assert.equal(acceptChatLine(line({ id: '5', text: 'hello', badge: 'vip', login: 'noisy' }), options), false);
});

test('buffer keeps the newest lines and clears by message, user, or channel', () => {
  let lines: OverlayChatLine[] = [];
  for (let i = 0; i < 120; i += 1) lines = pushChatLine(lines, line({ id: `m${i}`, text: 'x', userId: i < 2 ? 'same' : `u${i}` }));
  assert.equal(lines.length, 100);
  assert.equal(lines[0].id, 'm20');
  assert.equal(applyChatClear(lines, { scope: 'message', messageId: 'm20' }).some(item => item.id === 'm20'), false);
  assert.equal(applyChatClear([line({ id: 'a', text: 'a', userId: 'same' }), line({ id: 'b', text: 'b', userId: 'other' })], { scope: 'user', userId: 'same' }).length, 1);
  assert.deepEqual(applyChatClear(lines, { scope: 'all' }), []);
  const visible = visibleChatLines([line({ id: 'old', text: 'old', ts: 0 }), line({ id: 'new', text: 'new', ts: 10_000 })], { ...DEFAULT_CHAT_OPTIONS, enabled: true, lifetimeSeconds: 5, maxLines: 10 }, 10_000);
  assert.deepEqual(visible.map(item => item.id), ['new']);
});

test('third-party names do not replace a twitch emote range', () => {
  const segments = segmentChat('Kappa Kappa', [{ id: '25', start: 0, end: 4 }], { Kappa: 'https://cdn.example/kappa.webp' });
  const first = segments[0];
  const last = segments.at(-1);
  assert.equal(first?.type, 'emote');
  assert.equal(first?.type === 'emote' && first.url.includes('jtvnw.net'), true);
  assert.equal(last?.type === 'emote' && last.url, 'https://cdn.example/kappa.webp');
});

test('provider payloads become a name index', () => {
  const into = new Map<string, string>();
  add7tvEmotes({ emotes: [{ id: '7tv-id', name: 'PepeLaugh' }, { id: 'jam', name: 'catJAM', data: { animated: true } }] }, into);
  addBttvEmotes([{ id: 'bttv-id', code: 'OMEGALUL' }], into);
  addFfzEmotes({ sets: { '1': { emoticons: [
    { name: 'LULW', urls: { '1': '//cdn.frankerfacez.com/lulw.png' } },
    { name: 'KEKW', urls: { '1': '//cdn.frankerfacez.com/still.png' }, animated: { '1': '//cdn.frankerfacez.com/emote/1/animated/1' } }
  ] } } }, into);
  assert.equal(into.get('PepeLaugh'), 'https://cdn.7tv.app/emote/7tv-id/1x.webp');
  assert.equal(into.get('catJAM'), 'https://cdn.7tv.app/emote/jam/2x.gif');
  assert.equal(into.get('OMEGALUL')?.includes('betterttv.net'), true);
  assert.equal(into.get('LULW'), 'https://cdn.frankerfacez.com/lulw.png');
  assert.equal(into.get('KEKW'), 'https://cdn.frankerfacez.com/emote/1/animated/1');
});

test('overlay token compare rejects a different length and a different value', () => {
  assert.equal(tokensMatch('a'.repeat(32), 'a'.repeat(32)), true);
  assert.equal(tokensMatch('a'.repeat(32), 'b'.repeat(32)), false);
  assert.equal(tokensMatch('a'.repeat(32), 'a'.repeat(31)), false);
  assert.equal(tokensMatch('', 'a'.repeat(32)), false);
});

test('chat options survive an overlay URL round-trip', () => {
  const expected = { ...DEFAULT_OVERLAY_OPTIONS, chat: { ...DEFAULT_CHAT_OPTIONS, enabled: true, maxLines: 8, roleFilter: 'moderator' as const, blockWords: ['nope'], x: 12.5 } };
  assert.deepEqual(parseOverlayOptions(new URLSearchParams(createOverlaySearch(expected))).chat, expected.chat);
  assert.equal(chatFromParams(new URLSearchParams(chatSearchParams(DEFAULT_CHAT_OPTIONS))).enabled, false);
  assert.equal(chatFromParams(new URLSearchParams('chatStyle=terminal')).style, 'terminal');
  assert.equal(chatFromParams(new URLSearchParams('chatStyle=nametag')).style, 'nametag');
  assert.equal(chatFromParams(new URLSearchParams('chatStyle=nope')).style, 'classic');
  assert.equal(chatFromParams(new URLSearchParams('chatMotion=wipe')).motion, 'wipe');
  assert.equal(chatFromParams(new URLSearchParams('chatMotion=nope')).motion, 'rise');
  assert.equal(chatSearchParams({ ...DEFAULT_CHAT_OPTIONS, motion: 'blur' }).chatMotion, 'blur');
  assert.equal(chatFromParams(new URLSearchParams('chatMotion=slide')).exitMotion, 'slide');
  assert.equal(chatFromParams(new URLSearchParams('chatMotion=slide&chatExitMotion=drop')).exitMotion, 'drop');
  assert.equal(chatFromParams(new URLSearchParams('chatExitMotion=nope')).exitMotion, 'rise');
  assert.equal(chatSearchParams({ ...DEFAULT_CHAT_OPTIONS, motion: 'slide', exitMotion: 'pop' }).chatExitMotion, 'pop');
  assert.equal(normalizeChat({ motion: 'shutter' }).exitMotion, 'shutter');
  assert.equal(normalizeChat({ motion: 'wipe', exitMotion: 'flash' }).exitMotion, 'flash');
});

test('lifetime exit animates and a full buffer cut does not', () => {
  const options = { ...DEFAULT_CHAT_OPTIONS, enabled: true, lifetimeSeconds: 10, fadeMs: 180, motion: 'rise' as const, maxLines: 1 };
  const older = line({ id: 'old', text: 'old', ts: 1_000 });
  const newer = line({ id: 'new', text: 'new', ts: 2_000 });
  const held = chatPresence([older, newer], new Set(['old', 'new']), options, 5_000);
  assert.deepEqual(held.visible.map(item => item.id), ['new']);
  assert.deepEqual(held.leaving.map(item => item.id), []);
  const expired = chatPresence([older], new Set(['old']), options, 12_000);
  assert.deepEqual(expired.visible.map(item => item.id), []);
  assert.deepEqual(expired.leaving.map(item => item.id), ['old']);
  const instant = chatPresence([older], new Set(['old']), { ...options, fadeMs: 0 }, 12_000);
  assert.deepEqual(instant.leaving, []);
  const stay = chatPresence([older], new Set(['old']), { ...options, lifetimeSeconds: 0 }, 99_000);
  assert.deepEqual(stay.visible.map(item => item.id), ['old']);
  assert.deepEqual(stay.leaving, []);
  const cut = chatPresence([older], new Set(['old']), { ...options, exitMotion: 'none' }, 12_000);
  assert.deepEqual(cut.leaving, []);
  const faded = chatPresence([older], new Set(['old']), { ...options, motion: 'none', exitMotion: 'fade' }, 12_000);
  assert.deepEqual(faded.leaving.map(item => item.id), ['old']);
});

test('global Twitch badges keep hosted images and drop foreign URLs', () => {
  const sets = parseGlobalBadges({
    data: [
      { set_id: 'vip', versions: [{ id: '1', title: 'VIP', image_url_2x: 'https://static-cdn.jtvnw.net/badges/v1/vip/2' }] },
      { set_id: 'bits', versions: [{ id: '1', title: 'Bits', image_url_1x: 'https://evil.example/badge.png', image_url_2x: 'https://static-cdn.jtvnw.net/badges/v1/bits/2' }] },
      { set_id: '../nope', versions: [{ id: '1', title: 'No', image_url_2x: 'https://static-cdn.jtvnw.net/badges/v1/x/2' }] }
    ]
  });
  assert.deepEqual(sets.map(set => set.id), ['vip', 'bits']);
  assert.equal(sets[1].versions[0].image, 'https://static-cdn.jtvnw.net/badges/v1/bits/2');
});
