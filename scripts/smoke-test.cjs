const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
const project = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-smoke-'));
const portable = process.argv[2] === '--standalone' ? path.resolve(process.argv[3]) : null;
if (portable) {
  fs.cpSync(portable, temp, { recursive: true });
} else {
fs.cpSync(path.join(project, 'dist'), path.join(temp, 'dist'), { recursive: true });
fs.symlinkSync(path.join(project, 'node_modules'), path.join(temp, 'node_modules'), 'junction');
}
const child = spawn(portable ? path.join(temp, 'runtime/node.exe') : process.execPath, [path.join(temp, portable ? 'scripts/start.cjs' : 'dist/server.cjs')], { cwd: portable ? os.tmpdir() : temp, env: { ...process.env, NODE_PATH: '', NODE_ENV: 'production', TWITCH_CHANNEL: '', TWITCH_BOT_USERNAME: '', TWITCH_BOT_OAUTH_TOKEN: '', YTMDA_AUTH_TOKEN: '', YTMDA_COMPANION_URL: 'http://127.0.0.1:9863' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
const base = 'http://127.0.0.1:3000';
try {
 for(let attempt=0; attempt<60; attempt++) {
   if(child.exitCode !== null) throw new Error(output);
   if(output.includes('Server running')) break;
   await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.match(output,/Server running/);
 assert.equal((await fetch(base+'/api/health').then(r=>r.json())).app,'twitch-ytm-song-request-bot');
 for (const prefix of ['/api', '/api/v1']) {
   assert.equal((await fetch(base+prefix+'/health')).status,200);
   const missing=await fetch(base+prefix+'/does-not-exist');
   assert.equal(missing.status,404);
   assert.equal((await missing.json()).code,'NOT_FOUND');
 }
 assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://untrusted.example'}})).status,403);
 const session=await fetch(base+'/api/session').then(r=>r.json());
 const post=(url,data)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-Bot-Session':session.token},body:JSON.stringify(data)});
 assert.equal((await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await post('/api/config',{maxActivePerViewer:-1})).status,400);
 const saved=await post('/api/config',{simulationMode:true,twitchBotOauthToken:'integration-test-secret',ytmdaAuthToken:'integration-test-secret'}).then(r=>r.text());
 assert.equal(saved.includes('integration-test-secret'),false);
 assert.equal((await post('/api/playback/volume',{volume:0}).then(r=>r.json())).success,true);
 assert.equal((await fetch(base+'/api/state').then(r=>r.json())).playback.volume,0);
 const ws=new WebSocket('ws://127.0.0.1:3000/ws');
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(new Error('WebSocket timeout'));},5000);ws.onmessage=e=>{clearTimeout(timer);try{assert.equal(e.data.includes('integration-test-secret'),false);ws.close();resolve();}catch(e){reject(e);}};ws.onerror=e=>{clearTimeout(timer);reject(e);};});
 assert.equal((await fetch(base+'/server.cjs')).status,404);
 for(const route of ['/','/overlay','/overlay/standalone']) assert.equal((await fetch(base+route)).status,200);
 console.log('Production HTTP/WebSocket smoke test passed: health, origin protection, validation, token redaction, volume 0, static files, dashboard and overlays.');
} finally { child.kill(); await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve)); fs.rmSync(temp,{recursive:true,force:true}); }
})().catch(error=>{ console.error(error); process.exitCode=1; });
