const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const desktopDir = path.join(root, 'desktop');
const localElectron = path.join(desktopDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function httpPost(url, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...extraHeaders
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(postData);
    req.end();
  });
}

async function isServerRunning() {
  try {
    const res = await httpGet('http://127.0.0.1:3000/api/state');
    return res.status === 200;
  } catch {
    return false;
  }
}

async function runTest() {
  console.log('================================================================');
  console.log('🧪 DIAGNOSE & TEST: Kaltstart bis zur Song-Wiedergabe im Browser');
  console.log('================================================================\n');

  // Terminate any previous electron instances
  if (process.platform === 'win32') {
    try { execSync('taskkill /f /im electron.exe', { stdio: 'ignore' }); } catch {}
  }

  const tStart = Date.now();
  let serverProcess = null;
  const serverUp = await isServerRunning();
  if (!serverUp) {
    console.log('1️⃣  Starte Node.js Backend Server (Port 3000)...');
    serverProcess = spawn('node', ['dist/server.cjs'], {
      cwd: root,
      stdio: 'ignore'
    });
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 250));
      if (await isServerRunning()) break;
      attempts++;
    }
  }
  const tServerReady = Date.now();
  console.log(`   ✓ Backend Server bereit nach ${tServerReady - tStart} ms`);

  console.log('2️⃣  Starte Electron Desktop App (Initialer Kaltstart)...');
  const electronExe = fs.existsSync(localElectron) ? localElectron : 'electron';
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  const electronChild = spawn(electronExe, ['.'], {
    cwd: desktopDir,
    stdio: 'ignore',
    env: electronEnv,
    shell: !fs.existsSync(localElectron)
  });

  const tElectronSpawned = Date.now();
  console.log('3️⃣  Warte auf Companion API (Port 9863) & Webview Mounting...');

  let companionReadyTime = null;
  let attempts = 0;
  while (attempts < 40) {
    await new Promise(r => setTimeout(r, 300));
    attempts++;
    try {
      const res = await httpGet('http://127.0.0.1:9863/api/v1/performance');
      if (res.status === 200) {
        companionReadyTime = Date.now();
        break;
      }
    } catch {}
  }

  if (!companionReadyTime) {
    console.error('❌ Timeout: Companion API auf Port 9863 hat nicht rechtzeitig reagiert.');
    cleanup();
    process.exit(1);
  }
  console.log(`   ✓ Companion API / Desktop-Fenster bereit nach ${companionReadyTime - tStart} ms`);

  console.log('4️⃣  Prüfe Webview DOM-Ready & Finish-Load für YouTube Music...');
  let ytmMetrics = null;
  attempts = 0;
  while (attempts < 80) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
    try {
      const res = await httpGet('http://127.0.0.1:9863/api/v1/performance');
      if (res.status === 200 && res.body && Array.isArray(res.body.webviews)) {
        const ytm = res.body.webviews.find(w => w.name === 'YouTube Music' || (w.url && w.url.includes('music.youtube.com')));
        if (ytm && ytm.domReadyMs) {
          ytmMetrics = ytm;
          break;
        }
      }
    } catch {}
  }

  const tYtmDomReady = Date.now();
  if (ytmMetrics) {
    console.log(`   ✓ YouTube Music Webview DOM-Ready gemeldet in ${ytmMetrics.domReadyMs} ms (Absolut: ${tYtmDomReady - tStart} ms)`);
  } else {
    console.log(`   ⚠️ DOM-Ready noch nicht vollständig gemeldet, fahre fort...`);
  }

  console.log('5️⃣  Sende Song-Request an den Bot (/api/song/request: "The Less I Know The Better")...');
  let sessionToken = '';
  try {
    const sRes = await httpGet('http://127.0.0.1:3000/api/session');
    sessionToken = sRes.body?.token || '';
  } catch {}

  // Clear queue to prevent duplicate rejection
  try {
    await httpPost('http://127.0.0.1:3000/api/queue/clear', {}, { 'x-bot-session': sessionToken });
  } catch {}

  const tRequestStart = Date.now();
  let songResponse = null;
  try {
    songResponse = await httpPost('http://127.0.0.1:3000/api/song/request', {
      query: 'Daft Punk One More Time',
      username: 'streamer',
      badge: 'broadcaster'
    }, { 'x-bot-session': sessionToken });
  } catch (err) {
    console.error('❌ Fehler beim Senden des Songrequests:', err.message);
  }

  const tRequestDone = Date.now();
  console.log(`   ✓ Song-Suche & Resolver abgeschlossen in ${tRequestDone - tRequestStart} ms:`, JSON.stringify(songResponse?.body));

  console.log('6️⃣  Messe Zeit bis Audio/Video im Webview tatsächlich abspielt (playing)...');
  let playbackStarted = false;
  let playbackStartTime = null;
  let lastState = null;
  attempts = 0;

  while (attempts < 60) { // bis zu 30 Sekunden
    await new Promise(r => setTimeout(r, 500));
    attempts++;
    try {
      const res = await httpGet('http://127.0.0.1:9863/api/v1/state');
      if (res.status === 200 && res.body) {
        lastState = res.body;
        const player = res.body.player;
        const video = res.body.video;

        const isPlaying = (player && (player.trackState === 1 || player.isPaused === false) && player.hasSong) ||
                          (video && player && !player.isPaused);
        const hasProgress = player && (player.videoProgress > 0 || player.currentTime > 0);

        if (isPlaying || hasProgress) {
          playbackStarted = true;
          playbackStartTime = Date.now();
          break;
        }
      }
    } catch {}
  }

  console.log('\n================================================================');
  console.log('📊 TEST-ERGEBNISSE: Analyse des Kaltstarts bis zur Wiedergabe');
  console.log('================================================================\n');

  console.log(`• App & Backend Startzeit:             ${tServerReady - tStart} ms`);
  console.log(`• Electron / Companion API Startzeit:  ${companionReadyTime - tStart} ms`);
  console.log(`• YouTube Music Webview DOM-Ready:     ${ytmMetrics ? ytmMetrics.domReadyMs : 'N/A'} ms`);
  console.log(`• Song-Request & YouTube Resolver:     ${tRequestDone - tRequestStart} ms`);

  if (playbackStarted && playbackStartTime) {
    const timeFromRequestToPlay = playbackStartTime - tRequestDone;
    const totalTimeFromBootToPlay = playbackStartTime - tStart;
    console.log(`• Zeit von Song-Request bis Play:      ${timeFromRequestToPlay} ms (~${(timeFromRequestToPlay / 1000).toFixed(1)}s)`);
    console.log(`----------------------------------------------------------------`);
    console.log(`⏱ GESAMTZEIT (Kaltstart -> Musik spielt): ${totalTimeFromBootToPlay} ms (~${(totalTimeFromBootToPlay / 1000).toFixed(1)}s)`);
  } else {
    console.log(`⚠️ Wiedergabe konnte innerhalb des Timeouts nicht bestätigt werden.`);
    console.log('Letzter bekannter Player-Status:', JSON.stringify(lastState));
  }

  // Check detailed performance logs
  try {
    const perfRes = await httpGet('http://127.0.0.1:9863/api/v1/performance');
    console.log('\nWebview Status Übersicht:');
    if (perfRes.body?.webviews) {
      for (const w of perfRes.body.webviews) {
        console.log(`  - ${w.name}: DOM Ready ${w.domReadyMs || 'pending'}ms, Finish Load ${w.finishLoadMs || 'pending'}ms, Status: ${w.status}`);
      }
    }
  } catch {}

  console.log('================================================================\n');

  cleanup();

  function cleanup() {
    try { electronChild.kill(); } catch {}
    if (process.platform === 'win32') {
      try { execSync('taskkill /f /im electron.exe', { stdio: 'ignore' }); } catch {}
    }
    if (serverProcess) {
      try { serverProcess.kill(); } catch {}
    }
  }
}

runTest().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

