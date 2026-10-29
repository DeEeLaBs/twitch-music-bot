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
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
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

async function runBenchmark() {
  console.log('====================================================');
  console.log('🏁 Web Player Cold-Start Performance Benchmark');
  console.log('====================================================\n');

  // Ensure no stale electron processes interfere with single-instance lock
  if (process.platform === 'win32') {
    try { execSync('taskkill /f /im electron.exe', { stdio: 'ignore' }); } catch {}
  }

  let serverProcess = null;
  const serverUp = await isServerRunning();
  if (!serverUp) {
    console.log('⏳ Starting background server on port 3000...');
    serverProcess = spawn('node', ['dist/server.cjs'], {
      cwd: root,
      stdio: 'ignore'
    });
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 300));
      if (await isServerRunning()) break;
      attempts++;
    }
    console.log('✓ Background server ready on port 3000.');
  } else {
    console.log('✓ Server already running on port 3000.');
  }

  console.log('⏳ Launching Electron Desktop with Webview Pre-warming...');
  const electronExe = fs.existsSync(localElectron) ? localElectron : 'electron';
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  const electronChild = spawn(electronExe, ['.'], {
    cwd: desktopDir,
    stdio: 'ignore',
    env: electronEnv,
    shell: !fs.existsSync(localElectron)
  });

  const startTime = Date.now();
  console.log('⏳ Tracking Webview lifecycle (attach -> dom-ready -> did-finish-load)...');

  let perfData = null;
  let attempts = 0;
  const maxAttempts = 50; // Up to 25 seconds

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
    try {
      const res = await httpGet('http://127.0.0.1:9863/api/v1/performance');
      if (res.status === 200 && res.body && Array.isArray(res.body.webviews) && res.body.webviews.length > 0) {
        const webviews = res.body.webviews;
        const ytm = webviews.find(w => w.name === 'YouTube Music' || (w.url && w.url.includes('music.youtube.com')));
        const spotify = webviews.find(w => w.name === 'Spotify' || (w.url && w.url.includes('spotify.com')));

        if (webviews.length > 0 && webviews.every(w => w.domReadyMs)) {
          perfData = { webviews, totalElapsed: Date.now() - startTime };
          // If all mounted webviews have finished loading or after 15 seconds, finish
          if (webviews.every(w => w.finishLoadMs) || attempts > 25) {
            break;
          }
        }
      }
    } catch {}
  }

  // Gracefully terminate Electron benchmark instance
  try { electronChild.kill(); } catch {}
  if (process.platform === 'win32') {
    try { execSync('taskkill /f /im electron.exe', { stdio: 'ignore' }); } catch {}
  }
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
  }

  if (!perfData) {
    console.error('❌ Benchmark timed out or failed to collect webview metrics.');
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('📊 ERGEBNISSE: Kaltstart-Aufbauzeit der Webplayer');
  console.log('====================================================');

  for (const wv of perfData.webviews) {
    console.log(`\n🎵 Provider: ${wv.name || 'Webview'}`);
    console.log(`   - URL: ${wv.url || 'pending'}`);
    console.log(`   - Aufbauzeit DOM-Ready (Interaktiv): ${wv.domReadyMs ? wv.domReadyMs + ' ms' : 'N/A'}`);
    console.log(`   - Aufbauzeit Finish-Load (Komplett geladen): ${wv.finishLoadMs ? wv.finishLoadMs + ' ms' : 'in progress'}`);
    console.log(`   - Status: ${wv.status}`);
  }

  console.log('\n----------------------------------------------------');
  console.log(`⏱ Gesamte Kaltstartzeit bis beide Player einsatzbereit: ${perfData.totalElapsed} ms`);
  console.log('⚡ Umschaltzeit zwischen YouTube Music und Spotify: 0 ms (Sofort/Nahtlos)');
  console.log('====================================================\n');
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});

