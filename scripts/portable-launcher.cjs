const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

function launchOptions(root, environment = process.env) {
  const env = { ...environment, NODE_ENV: 'production', NODE_PATH: '' };
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  return { executable: path.join(root, 'runtime', 'node.exe'), args: [path.join(root, 'scripts', 'start.cjs')], cwd: root, env };
}
function isBotHealth(value) { return value?.status === 'ok' && ['twitch-music-bot', 'twitch-ytm-song-request-bot'].includes(value.app); }
function portAvailable(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}
function health() {
  return new Promise(resolve => {
    const request = http.get('http://127.0.0.1:3000/api/health', response => {
      let data = '';
      response.on('data', part => { data += part; });
      response.on('end', () => { try { resolve(response.statusCode === 200 && isBotHealth(JSON.parse(data))); } catch { resolve(false); } });
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => { request.destroy(); resolve(false); });
  });
}
async function startPortable(root) {
  const { app, dialog, components } = require('electron');
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  app.setPath('userData', path.join(root, 'data', 'browser-profile'));
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  const options = launchOptions(root);
  let serverChild;
  const shutdown = () => { if (serverChild && serverChild.exitCode === null) serverChild.kill(); };
  app.on('before-quit', shutdown);
  process.on('exit', shutdown);
  try {
    if (!await portAvailable(3000)) throw new Error('Ein Bot laeuft bereits (Port 3000). Bitte zuerst die andere Version beenden.');
    // Port 9863 is the embedded companion. A leftover listener must not block startup;
    // the desktop process reuses it or skips binding when the port is busy.
    const stdout = fs.openSync(path.join(root, 'data', 'server-stdout.log'), 'a');
    const stderr = fs.openSync(path.join(root, 'data', 'server-stderr.log'), 'a');
    serverChild = spawn(options.executable, options.args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ['ignore', stdout, stderr] });
    fs.closeSync(stdout); fs.closeSync(stderr);
    let spawnError;
    serverChild.on('error', error => { spawnError = error; });
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (spawnError) throw spawnError;
      if (serverChild.exitCode !== null) throw new Error('Der Botserver konnte nicht starten. Siehe data/server-stderr.log.');
      if (await health()) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Der Botserver antwortet nicht. Siehe data/server-stderr.log.');
    await app.whenReady();
    // Do not start the Spotify webview before its DRM component is ready.
    await require(path.join(root, 'desktop', 'drm.cjs')).openDesktopAfterDrm(
      components,
      () => require(path.join(root, 'desktop', 'main.cjs')),
      result => fs.appendFileSync(path.join(root, 'data', 'electron-console.log'), `DRM: ${result.reason}\n`)
    );
    serverChild.on('exit', () => { if (!app.isQuitting) app.quit(); });
  } catch (error) {
    shutdown();
    await app.whenReady();
    dialog.showErrorBox('MusicBot konnte nicht starten', error.message);
    app.quit();
  }
}
module.exports = { launchOptions, isBotHealth, portAvailable, startPortable };
