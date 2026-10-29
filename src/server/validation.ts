import type { BadgeType, BotConfig } from '../types.ts';
import { spotifyPlaylistUri } from '../spotifyPlaylist.ts';
const badges: BadgeType[]=['viewer','subscriber','vip','moderator','broadcaster'];
export function validateConfig(body: unknown): Partial<BotConfig> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Konfiguration muss ein Objekt sein.');
  const result: Record<string, unknown> = {};
  const strings = ['twitchChannel','twitchBotUsername','twitchBotOauthToken','twitchClientId','twitchClientSecret','ytmdaAuthToken','ytmdaCompanionUrl','channelPointsRewardId','spotifyClientId','spotifyPreferredDeviceId'];
  const limits: Record<string,[number,number]>={maxSongDurationSeconds:[10,7200],minSongDurationSeconds:[0,600],maxActivePerViewer:[1,20],maxQueueSize:[1,500],preventRecentDuplicates:[0,100],voteSkipThreshold:[1,100],nowPlayingCooldownSeconds:[1,300],requestCooldownSeconds:[0,300],globalRequestCooldownSeconds:[0,60],overlayPort:[3000,3000]};
  for (const [key,value] of Object.entries(body)) {
    if (key === 'streamPlaylistUrl') {
      if (typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value)) throw new Error('Ungültiger Playlist-Link.');
      const input = value.trim();
      if (!input) { result[key] = ''; continue; }
      if (input.startsWith('spotify:')) { result[key] = spotifyPlaylistUri(input); continue; }
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Playlist-Link muss HTTPS verwenden.');
      if (url.hostname === 'open.spotify.com') spotifyPlaylistUri(input);
      else if (!['music.youtube.com', 'www.youtube.com', 'youtube.com'].includes(url.hostname) || url.pathname !== '/playlist' || !url.searchParams.get('list')) throw new Error('Ungültiger Playlist-Link.');
      result[key] = input; continue;
    }
    if (key === 'spotifyFallbackPlaylist') {
      if (typeof value !== 'string') throw new Error('Ungültige Spotify-Playlist.');
      result[key] = spotifyPlaylistUri(value); continue;
    }
    if (strings.includes(key)) { if(typeof value!=='string'||value.length>4096||/[\r\n]/.test(value)) throw new Error('Ungültiger Wert für '+key); result[key]=value.trim(); }
    else if (key in limits) { const [min,max]=limits[key]; if(!Number.isInteger(value)||(value as number)<min||(value as number)>max) throw new Error(key+': Wert außerhalb des erlaubten Bereichs.'); result[key]=value; }
    else if (['autoPlayRadio','simulationMode','channelPointsEnabled','persistSearchCache','spotifyFallbackToYtm'].includes(key)) { if(typeof value!=='boolean') throw new Error('Ungültiger Schalter: '+key); result[key]=value; }
    else if (key === 'playbackProvider') { if(value !== 'youtube_music' && value !== 'spotify') throw new Error('Ungültiger Provider'); result[key]=value; }
    else if (key==='language') { if(!['de','en'].includes(value as string)) throw new Error('Ungültige Sprache.'); result[key]=value; }
    else if (key==='logLevel') { if(!['debug','info','warn','error'].includes(value as string)) throw new Error('Ungültiges Log-Level.'); result[key]=value; }
    else if (key==='blockedRequesters') { if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||v.length>40)) throw new Error('Ungültige Requester-Sperrliste.'); result[key]=value; }
    else if (key==='tabOrder') { if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||v.length>50)) throw new Error('Ungültige Tab-Reihenfolge.'); result[key]=value; }
    else if (key==='commandCooldowns') { if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Ungültige Cooldowns.'); const clean:Record<string,number>={}; for(const [k,v] of Object.entries(value as object)){if(!/^[a-z]+$/.test(k)||!Number.isInteger(v)||(v as number)<0||(v as number)>600) throw new Error('Ungültiger Command-Cooldown.'); clean[k]=v as number;} result[key]=clean; }
    else if (key==='commandPermissions') { if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Ungültige Berechtigungen.'); const clean:Record<string,BadgeType[]>={}; for(const [k,v] of Object.entries(value as object)){if(!Array.isArray(v)||v.some(x=>!badges.includes(x as BadgeType))) throw new Error('Ungültige Command-Berechtigung.'); clean[k]=v as BadgeType[];} result[key]=clean; }
    else throw new Error('Unbekanntes Konfigurationsfeld: '+key);
  }
  if (result.ytmdaCompanionUrl) { const url=new URL(result.ytmdaCompanionUrl as string); if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/') throw new Error('Begleitserver muss eine lokale Basis-URL sein.'); }
  for (const key of ['twitchChannel','twitchBotUsername']) if(result[key]&&!/^#?[a-zA-Z0-9_]{1,25}$/.test(result[key] as string)) throw new Error('Ungültiger Twitch-Name.');
  return result as Partial<BotConfig>;
}
export function textField(value: unknown,name:string,max=500):string { if(typeof value!=='string'||!value.trim()||value.length>max||/[\r\n]/.test(value)) throw new Error(name+' ist ungültig.'); return value.trim(); }
