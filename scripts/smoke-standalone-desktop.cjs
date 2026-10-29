const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
async function unusedPort() {
 return new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
}
(async () => {
 const portable = path.resolve(process.argv[2]);
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'musicbot-portable-qa-'));
 assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
 fs.cpSync(portable, directory, { recursive: true });
 const port = await unusedPort(), companionPort = await unusedPort();
 const replacements = value => value.replaceAll('127.0.0.1:3000', `127.0.0.1:${port}`).replaceAll('localhost:3000', `localhost:${port}`);
 const backend = path.join(directory, 'dist/server.cjs');
 fs.writeFileSync(backend, replacements(fs.readFileSync(backend, 'utf8')).replace(/var PORT = (?:3000|3e3);/, `var PORT = ${port};`));
 const main = path.join(directory, 'desktop/main.cjs');
 fs.writeFileSync(main, replacements(fs.readFileSync(main, 'utf8')).replace(/\.listen\(9863,/, `.listen(${companionPort},`).replace('win = new BrowserWindow({', 'win = new BrowserWindow({ show: false,'));
 const launcher = path.join(directory, 'scripts/portable-launcher.cjs');
 fs.writeFileSync(launcher, replacements(fs.readFileSync(launcher, 'utf8')).replace('portAvailable(3000)', `portAvailable(${port})`).replace('portAvailable(9863)', `portAvailable(${companionPort})`).replace("dialog.showErrorBox('MusicBot konnte nicht starten', error.message);", 'fs.writeFileSync(path.join(root, "qa-error.txt"), String(error));'));
 fs.writeFileSync(path.join(directory, 'data/bot-config.json'), JSON.stringify({ simulationMode: true, language: 'de' }));
 const resultFile = path.join(directory, 'qa-result.json');
 const bootstrap = path.join(directory, 'resources/app/bootstrap.cjs');
 const probe = `
 const electron = require('electron');
 const fs = require('node:fs');
 electron.app.on('browser-window-created', (_event, win) => {
  win.webContents.on('did-finish-load', async () => {
   if (!win.webContents.getURL().startsWith('http://127.0.0.1:${port}')) return;
   for (let attempt = 0; attempt < 60; attempt++) {
    const result = await win.webContents.executeJavaScript("({title:document.title,player:!!document.getElementById('now-playing-card'),queue:!!document.getElementById('queue-list-container'),text:document.body.innerText.slice(0,300)})");
    if (result.player && result.queue) {
     const health = await fetch('http://127.0.0.1:${port}/api/health').then(r=>r.json());
     const companion = await fetch('http://127.0.0.1:${companionPort}/api/v1/state').then(r=>r.status);
     fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({...result,health:health.status,companionStatus:companion}));
     const picture = await win.webContents.capturePage(); fs.writeFileSync(${JSON.stringify(path.join(portable, '..', 'standalone-preview.png'))}, picture.toPNG());
     electron.app.quit(); return;
    }
    await new Promise(resolve=>setTimeout(resolve,150));
   }
   fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({error:'dashboard did not load'})); electron.app.quit();
  });
 });
 setTimeout(()=>{fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({error:'startup timeout'}));electron.app.quit();},45000).unref();
 `;
 fs.writeFileSync(bootstrap, probe + '\n' + fs.readFileSync(bootstrap, 'utf8'));
 const env = { ...process.env, NODE_PATH: '', PATH: process.env.SystemRoot + '\\System32', TWITCH_CHANNEL: '', TWITCH_BOT_USERNAME: '', TWITCH_BOT_OAUTH_TOKEN: '', TWITCH_CLIENT_ID: '', YTMDA_AUTH_TOKEN: '', SPOTIFY_CLIENT_ID: '' };
 delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
 const child = spawn(path.join(directory, 'MusicBot.exe'), [], { cwd: os.tmpdir(), env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
 let output = ''; child.stdout.on('data', data=>output += data); child.stderr.on('data', data=>output += data);
 const timeout = setTimeout(()=>child.kill(),55000);
 try {
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  clearTimeout(timeout);
  if (!fs.existsSync(resultFile)) throw new Error('No native QA result. ' + output + (fs.existsSync(path.join(directory,'data/server-stderr.log'))?fs.readFileSync(path.join(directory,'data/server-stderr.log'),'utf8'):''));
  const result = JSON.parse(fs.readFileSync(resultFile,'utf8'));
  console.log(JSON.stringify(result));
  assert.equal(result.player,true); assert.equal(result.queue,true); assert.equal(result.health,'ok');
  assert.ok([200,401,403,503].includes(result.companionStatus));
  console.log('Native standalone smoke test passed with empty dependency search paths and isolated ports/data.');
 } finally {
  clearTimeout(timeout);
  // Keep this QA copy for diagnostic inspection; it is never included in the release ZIP.
  console.log('QA directory: ' + directory);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

