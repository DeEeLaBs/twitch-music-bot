import type { BotConfig, TwitchChannelPointReward } from '../types.ts';
import { logger } from './logger.ts';
interface TwitchTokenInfo { client_id?: string; login?: string; user_id?: string; scopes?: string[]; expires_in?: number; }
interface TwitchUser { id: string; login: string; display_name: string; }
interface TwitchRewardApiItem { id?: string; title?: string; cost?: number; prompt?: string; is_enabled?: boolean; is_user_input_required?: boolean; }
interface TwitchContext { token:string; clientId:string; broadcaster:TwitchUser; scopes:string[]; headers:Record<string,string>; }
function networkCode(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause && typeof cause === 'object' && 'code' in cause) return String((cause as { code?: unknown }).code || '');
  return error instanceof Error && error.message === 'fetch failed' ? 'FETCH_FAILED' : '';
}

const RETRYABLE = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'FETCH_FAILED']);

async function twitchFetch(input: string, init: RequestInit, en: boolean): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      last = error;
      const code = networkCode(error);
      if (!RETRYABLE.has(code) || init.signal?.aborted || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  const code = networkCode(last);
  logger.log('warn', 'TWITCH', 'Twitch request failed.', { code: code || 'unknown' });
  throw new Error(en
    ? `Twitch could not be reached${code ? ` (${code})` : ''}. Check the connection and try again.`
    : `Twitch ist nicht erreichbar${code ? ` (${code})` : ''}. Prüfe die Verbindung und versuche es erneut.`);
}

export class ChannelPointsService {
  private static async context(config:BotConfig):Promise<TwitchContext>{
    const rawToken=config.twitchBotOauthToken?.trim()||''; const token=rawToken.replace(/^oauth:/i,''); const channel=(config.twitchChannel||'').replace(/^#/,'').trim().toLowerCase(); const en=config.language==='en';
    if(!token) throw new Error(en?'No Twitch OAuth token is stored.':'Es ist noch kein Twitch-OAuth-Token gespeichert.'); if(!channel) throw new Error(en?'Enter and save your Twitch channel first.':'Trage zuerst deinen Twitch-Kanal ein.');
    const validateRes=await twitchFetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(8000)},en); if(!validateRes.ok) throw new Error(en?'The stored Twitch token is invalid or expired. Use “Connect with Twitch” in Setup to sign in again.':'Der gespeicherte Twitch-Token ist ungültig oder abgelaufen. Melde dich im Setup über „Mit Twitch verbinden“ erneut an.');
    const tokenInfo=await validateRes.json() as TwitchTokenInfo; const clientId=(tokenInfo.client_id||config.twitchClientId||'').trim(); if(!clientId) throw new Error('Es konnte keine Twitch Client-ID ermittelt werden.'); const scopes=Array.isArray(tokenInfo.scopes)?tokenInfo.scopes:[]; const headers={Authorization:`Bearer ${token}`,'Client-Id':clientId,'Content-Type':'application/json'};
    const userRes=await twitchFetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`,{headers,signal:AbortSignal.timeout(8000)},en); if(!userRes.ok) throw new Error(`Twitch-Benutzersuche fehlgeschlagen (HTTP ${userRes.status}).`); const userPayload=await userRes.json() as {data?:TwitchUser[]}; const broadcaster=userPayload.data?.[0]; if(!broadcaster?.id) throw new Error('Der eingetragene Twitch-Kanal wurde nicht gefunden.'); if(tokenInfo.user_id&&tokenInfo.user_id!==broadcaster.id) throw new Error('Kanalpunkte müssen mit dem Broadcaster-Konto autorisiert werden.');
    return {token,clientId,broadcaster,scopes,headers};
  }
  public static async listRewards(config:BotConfig){ const ctx=await this.context(config); if(!ctx.scopes.includes('channel:read:redemptions')&&!ctx.scopes.includes('channel:manage:redemptions')) throw new Error('Dem Twitch-Token fehlt channel:read:redemptions.'); const res=await twitchFetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(ctx.broadcaster.id)}`,{headers:ctx.headers,signal:AbortSignal.timeout(8000)},config.language==='en'); if(!res.ok) throw new Error(`Kanalpunkte-Belohnungen konnten nicht geladen werden (HTTP ${res.status}).`); const payload=await res.json() as {data?:TwitchRewardApiItem[]}; const rewards:TwitchChannelPointReward[]=(payload.data||[]).map(r=>({id:String(r.id||''),title:String(r.title||''),cost:Number(r.cost||0),prompt:r.prompt||'',isEnabled:Boolean(r.is_enabled),isUserInputRequired:Boolean(r.is_user_input_required)})).filter(r=>r.id&&r.title); return {success:true,broadcaster:{id:ctx.broadcaster.id,login:ctx.broadcaster.login,displayName:ctx.broadcaster.display_name},rewards}; }
  public static async createSongRequestReward(config:BotConfig,title='Song wünschen',cost=1000){ const ctx=await this.context(config); if(!ctx.scopes.includes('channel:manage:redemptions')) throw new Error('Zum Erstellen einer Belohnung wird channel:manage:redemptions benötigt.'); const res=await twitchFetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(ctx.broadcaster.id)}`,{method:'POST',headers:ctx.headers,body:JSON.stringify({title:title.slice(0,45),cost:Math.max(1,Math.round(cost)),prompt:'Interpret und Songtitel eingeben',is_user_input_required:true,is_enabled:true}),signal:AbortSignal.timeout(8000)},config.language==='en'); const body=await res.json() as {data?:TwitchRewardApiItem[];message?:string}; if(!res.ok) throw new Error(body.message||`Reward konnte nicht erstellt werden (HTTP ${res.status}).`); const r=body.data?.[0]; if(!r?.id) throw new Error('Twitch hat keine Reward-ID zurückgegeben.'); return {success:true,reward:{id:String(r.id),title:String(r.title||title),cost:Number(r.cost||cost),prompt:r.prompt||'',isEnabled:Boolean(r.is_enabled),isUserInputRequired:Boolean(r.is_user_input_required)}}; }
  public static async validateSelectedReward(config:BotConfig){ if(!config.channelPointsEnabled||!config.channelPointsRewardId) return {ok:false,reason:'not_configured'}; const result=await this.listRewards(config); const reward=result.rewards.find(r=>r.id===config.channelPointsRewardId); return reward?{ok:reward.isEnabled&&reward.isUserInputRequired,reward,reason:reward.isEnabled?(reward.isUserInputRequired?'ok':'input_not_required'):'disabled'}:{ok:false,reason:'missing'}; }
  public static async findRedemptionId(config: BotConfig, rewardId: string, userId: string, input: string, receivedAt: number): Promise<string> {
    if (!rewardId || !userId || !Number.isFinite(receivedAt)) return '';
    const ctx = await this.context(config);
    const matches: string[] = [];
    let cursor = '';
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ broadcaster_id:ctx.broadcaster.id, reward_id:rewardId, status:'UNFULFILLED', sort:'NEWEST', first:'50' });
      if (cursor) params.set('after', cursor);
      const response = await twitchFetch(`https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${params}`, { headers:ctx.headers, signal:AbortSignal.timeout(8000) }, config.language==='en');
      if (!response.ok) throw new Error(`Twitch redemption lookup failed (HTTP ${response.status}). Check reward ownership and broadcaster permissions.`);
      const body = await response.json() as {data?:Array<{id:string;user_id:string;user_input:string;redeemed_at:string}>;pagination?:{cursor?:string}};
      for (const item of body.data || []) {
        if (item.user_id === userId && item.user_input.trim() === input.trim() && Math.abs(Date.parse(item.redeemed_at)-receivedAt) <= 10000) matches.push(item.id);
      }
      cursor = body.pagination?.cursor || '';
      if (!cursor || (body.data || []).some(item=>Date.parse(item.redeemed_at)<receivedAt-10000)) return matches.length===1?matches[0]:'';
    }
    return ''; // Never guess when the scan is incomplete.
  }

  public static async updateRedemptionStatus(config: BotConfig, rewardId: string, redemptionId: string, status: 'CANCELED' | 'FULFILLED'): Promise<boolean> {
    if (!rewardId || !redemptionId) return false;
    try {
      const ctx = await this.context(config);
      if (!ctx.scopes.includes('channel:manage:redemptions')) {
        logger.log('warn', 'TWITCH', 'Channel points update requires channel:manage:redemptions.');
        return false;
      }
      const url = `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?broadcaster_id=${encodeURIComponent(ctx.broadcaster.id)}&reward_id=${encodeURIComponent(rewardId)}&id=${encodeURIComponent(redemptionId)}`;
      const res = await twitchFetch(url, {
        method: 'PATCH',
        headers: ctx.headers,
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(8000)
      }, config.language==='en');
      if (!res.ok) logger.log('warn', 'TWITCH', 'Channel points status update rejected.', { httpStatus:res.status, rewardId, redemptionId, status });
      return res.ok;
    } catch (error) {
      logger.log('warn', 'TWITCH', 'Channel points status update failed.', { error:String(error) });
      return false;
    }
  }
}
