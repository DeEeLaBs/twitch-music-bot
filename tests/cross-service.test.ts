import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSongMatch } from '../src/server/songMatch.ts';
const source={title:'Song',artist:'Daft Punk',duration:180};
const candidate={...source,id:'one'};
test('strict song matching accepts formatting, rejects versions, artists, lengths and unknown metadata',()=>{
 assert.equal(chooseSongMatch(source,[{...candidate,title:'Song (Official Audio)'}])?.id,'one');
 for(const bad of [{title:'Song (Live)'},{title:'Song Remix'},{title:'Song Cover'},{title:'Song Instrumental'},{artist:'Other'},{duration:190},{duration:0}]) assert.equal(chooseSongMatch(source,[{...candidate,...bad}]),null);
 assert.equal(chooseSongMatch({...source,artist:'Unknown Artist'},[candidate]),null);
});
test('distinct matching IDs are ambiguous; repeated copies of the same result are not',()=>{
 assert.throws(()=>chooseSongMatch(source,[candidate,{...candidate,id:'two'}]),/eindeutig/);
 assert.equal(chooseSongMatch(source,[candidate,candidate])?.id,'one');
});

import { resolveForPlaybackProvider } from '../src/server/playbackResolver.ts';
import { YouTubeResolver } from '../src/server/youtubeResolver.ts';
import { SpotifyService } from '../src/server/spotifyService.ts';
const spotifyId='A'.repeat(22),videoId='abcdefghijk';
const info={...source,videoId,thumbnailUrl:'',url:`https://music.youtube.com/watch?v=${videoId}`,channel:'Daft Punk - Topic'};
test('YouTube links resolve metadata then search Spotify without switching provider',async t=>{
 t.mock.method(YouTubeResolver,'resolve',async()=>info);
 const spotify=Object.create(SpotifyService.prototype) as SpotifyService;
 Object.assign(spotify,{isReadyForPlayback:()=>true,searchSpotifyCatalog:async()=>[{id:spotifyId,uri:`spotify:track:${spotifyId}`,name:source.title,artists:[{name:source.artist}],duration_ms:180000}]});
 const config={playbackProvider:'spotify' as const,spotifyFallbackToYtm:true};
 const link=`https://youtu.be/${videoId}`;
 const resolved=await resolveForPlaybackProvider(link,config,spotify);
 assert.equal(resolved.spotifyUri,`spotify:track:${spotifyId}`);assert.equal(resolved.sourceVideoId,videoId);
 assert.equal(resolved.originalRequestUrl,link);assert.equal(resolved.requestSource,'youtube');assert.equal(config.playbackProvider,'spotify');
});
test('invalid hosts, credentials, malformed links and collections fail before network access',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;throw new Error('unexpected network');});
 for(const link of ['https://evil.test/youtube.com/watch?v=abcdefghijk','https://youtube.com.evil.test/watch?v=abcdefghijk','https://user@youtube.com/watch?v=abcdefghijk','https://open.spotify.com/album/'+spotifyId,'spotify:playlist:'+spotifyId,'https://youtube.com/playlist?list=abc','https://youtube.com/watch?v=abcdefghijkNO','file:///local','https:broken']){
  await assert.rejects(resolveForPlaybackProvider(link,{playbackProvider:'youtube_music'}),/nicht unterstützt|Ungültiger/);
 }
 assert.equal(requests,0);
});
test('YouTube searches compare the full candidate set and reject ambiguous audio matches',async t=>{
 const make=(id:string,title=source.title)=>({musicResponsiveListItemRenderer:{playlistItemData:{videoId:id},flexColumns:[{musicResponsiveListItemFlexColumnRenderer:{text:{runs:[{text:title}]}}},{musicResponsiveListItemFlexColumnRenderer:{text:{runs:[{text:source.artist}]}}}],fixedColumns:[{musicResponsiveListItemFixedColumnRenderer:{text:{runs:[{text:'3:00'}]}}}]}});
 let rows=[make(videoId),make('lmnopqrstuv',source.title+' (Live)')];
 t.mock.method(globalThis,'fetch',async()=>new Response(`<script>var ytInitialData = ${JSON.stringify({contents:{musicShelfRenderer:{title:{runs:[{text:'Songs'}]},contents:rows}}})};</script>`));
 assert.equal((await YouTubeResolver.resolveMatchingTrack(source)).videoId,videoId);
 rows=[make(videoId),make('lmnopqrstuv')];
 await assert.rejects(YouTubeResolver.resolveMatchingTrack(source),/eindeutig/);
});
test('Spotify source identity survives YouTube playback and avoids playlist rematching',async t=>{
 const link=`spotify:track:${spotifyId}`;
 t.mock.method(YouTubeResolver,'resolve',async()=>({...info,spotifyUri:link,requestSource:'spotify' as const,originalRequestUrl:link}));
 const resolved=await resolveForPlaybackProvider(link,{playbackProvider:'youtube_music'});
 assert.equal(resolved.spotifyUri,undefined);assert.equal(resolved.sourceSpotifyUri,link);
});
test('Spotify matching propagates unavailable services and refuses alternative versions',async()=>{
 const spotify=Object.create(SpotifyService.prototype) as SpotifyService;
 Object.assign(spotify,{searchSpotifyCatalog:async()=>[{id:spotifyId,uri:`spotify:track:${spotifyId}`,name:'Song (Live)',artists:[{name:source.artist}],duration_ms:180000}]});
 await assert.rejects(spotify.matchTrack(source),/eindeutig/);
 Object.assign(spotify,{searchSpotifyCatalog:async()=>{throw new Error('Spotify Rate Limit aktiv. Erneut in 60s versuchen.');}});
 await assert.rejects(spotify.matchTrack(source),/60s/);
});

test('YouTube rate limits are respected without immediate retries',async t=>{
 const state=YouTubeResolver as unknown as {rateLimitedUntil:number};const before=state.rateLimitedUntil;
 t.after(()=>{state.rateLimitedUntil=before;});let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'60'}});});
 await assert.rejects(YouTubeResolver.resolveMatchingTrack(source),/Anfragelimit|60/);
 await assert.rejects(YouTubeResolver.resolveMatchingTrack(source),/Anfragelimit|60/);
 assert.equal(calls,1);
});
