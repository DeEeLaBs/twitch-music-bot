import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelPointsService } from '../src/server/channelPointsService.ts';
import type { BotConfig } from '../src/types.ts';
const config = { twitchBotOauthToken: 'test', twitchClientId: 'client', twitchChannel: 'streamer' } as BotConfig;
const now = Date.now();
function mockApi(t: any, data: any[]) {
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    if (String(url).includes('/validate')) return Response.json({ user_id:'broadcaster',scopes:['channel:manage:redemptions'] });
    if (String(url).includes('/users?')) return Response.json({data:[{id:'broadcaster'}]});
    assert.match(String(url), /status=UNFULFILLED/);
    return Response.json({data});
  });
}
test('refund lookup uses the real redemption ID and excludes other users and old requests', async t => {
  mockApi(t, [
    { id:'other', user_id:'other-user', user_input:'Song', redeemed_at:new Date(now).toISOString() },
    { id:'old', user_id:'viewer', user_input:'Song', redeemed_at:new Date(now-60000).toISOString() },
    { id:'actual-redemption', user_id:'viewer', user_input:'Song', redeemed_at:new Date(now).toISOString() }
  ]);
  assert.equal(await ChannelPointsService.findRedemptionId(config,'reward','viewer','Song',now), 'actual-redemption');
});
test('ambiguous redemptions are not guessed', async t => {
  mockApi(t, ['first','second'].map(id=>({id,user_id:'viewer',user_input:'Song',redeemed_at:new Date(now).toISOString()})));
  assert.equal(await ChannelPointsService.findRedemptionId(config,'reward','viewer','Song',now), '');
});
