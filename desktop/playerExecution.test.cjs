const test = require('node:test');
const assert = require('node:assert/strict');
const { withDeadline, youtubePlaybackTarget } = require('./playerExecution.cjs');
const fs = require('node:fs');
const vm = require('node:vm');

function spotifyClickHarness(hostname='open.spotify.com') {
  let ready,click,index=0,calls=0,fail=false;
  const pending=[];
  const button={disabled:false,testId:'control-button-skip-forward',label:'',inPlayer:true,
    getAttribute(name){return name==='data-testid'?this.testId:name==='aria-label'?this.label:null;},
    matches(){return this.testId==='control-button-skip-forward';},
    closest(selector){return selector.includes('now-playing-bar')?(this.inPlayer?this:null):this;}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./playerPreload.cjs'),'utf8'),{
    require:()=>({ipcRenderer:{on(){},send(){},sendToHost(channel){if(channel==='player-user-skip'){calls++;pending.push(()=>{if(!fail)index++;});}}}}),
    window:{location:{hostname},addEventListener:(_event,handler)=>{ready=handler;}},
    document:{querySelector:()=>null,addEventListener:(_event,handler)=>{assert.equal(click,undefined);click=handler;}},
    performance:{now:()=>0},setInterval:()=>1,clearInterval(){},requestAnimationFrame:fn=>fn(),
  });
  ready();
  return {
    click(trusted=true,flush=true){
      const event={isTrusted:trusted,target:{closest:()=>button},defaultPrevented:false,
        propagationStopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.propagationStopped=true;}};
      click(event);
      // Spotify's React handler need not check defaultPrevented: propagation
      // must stop before the click reaches the player's delegated listener.
      if(!event.propagationStopped&&!button.disabled)index++;
      if(flush)pending.splice(0).forEach(fn=>fn());
      return event;
    },
    flush(){pending.splice(0).forEach(fn=>fn());},
    fail(value){fail=value;},button,
    track:()=>['A','B','C'][index],calls:()=>calls,
  };
}

test('one embedded Spotify Next click advances A to B, never C; a second intentional click still works',()=>{
  const player=spotifyClickHarness();player.click();
  assert.equal(player.track(),'B');assert.equal(player.calls(),1);
  player.click();assert.equal(player.track(),'C');assert.equal(player.calls(),2);
});

test('programmatic Spotify clicks do not echo a second skip to the host',()=>{
  const player=spotifyClickHarness();player.click(false);
  assert.equal(player.track(),'B');assert.equal(player.calls(),0);
});

test('a delayed host response advances once without a native skip in the meantime',()=>{
  const player=spotifyClickHarness();const event=player.click(true,false);
  assert.equal(event.defaultPrevented,true);assert.equal(event.propagationStopped,true);
  assert.equal(player.track(),'A');player.flush();assert.equal(player.track(),'B');assert.equal(player.calls(),1);
});

test('a failed skip does not fall through to Spotify and the next separate action can succeed',()=>{
  const player=spotifyClickHarness();player.fail(true);player.click();assert.equal(player.track(),'A');
  player.fail(false);player.click();assert.equal(player.track(),'B');assert.equal(player.calls(),2);
});

test('YouTube clicks remain native and disabled Spotify controls do not send commands',()=>{
  const youtube=spotifyClickHarness('music.youtube.com');
  assert.equal(youtube.click().defaultPrevented,false);assert.equal(youtube.calls(),0);
  const disabled=spotifyClickHarness();disabled.button.disabled=true;disabled.click();
  assert.equal(disabled.calls(),0);assert.equal(disabled.track(),'A');
});

test('localized Next fallback is limited to player controls, not unrelated Spotify buttons',()=>{
  const player=spotifyClickHarness();player.button.testId='';player.button.label='Weiter';player.click();
  assert.equal(player.track(),'B');assert.equal(player.calls(),1);
  const unrelated=spotifyClickHarness();unrelated.button.testId='';unrelated.button.label='Next';unrelated.button.inPlayer=false;
  assert.equal(unrelated.click().defaultPrevented,false);assert.equal(unrelated.calls(),0);
});

test('a stuck player request times out and later requests can finish', async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 5), { code: 'PLAYER_TIMEOUT' });
  assert.equal(await withDeadline(Promise.resolve('ready')), 'ready');
});

test('radio requests navigate with a playlist so autoplay and Next have a queue', () => {
  const radio = youtubePlaybackTarget('abcdefghijk', true);
  assert.equal(radio.url, 'https://music.youtube.com/watch?v=abcdefghijk&list=RDAMVMabcdefghijk');
  assert.equal(radio.useInPagePlayer, false);
  const plain = youtubePlaybackTarget('abcdefghijk', false);
  assert.equal(plain.url, 'https://music.youtube.com/watch?v=abcdefghijk');
  assert.equal(plain.useInPagePlayer, true);
  assert.throws(() => youtubePlaybackTarget('bad', true), /invalid_video_id/);
});
