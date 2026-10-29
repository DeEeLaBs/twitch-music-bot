const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { hasGoogleLogin, startGoogleAuth } = require('./googleAuth.cjs');
const { mergePlaybackTimeline, playbackStateFromTimeline, playbackStateFromUrl, titleFromDocument } = require('./youtubeMetadata.cjs');
const { youtubePlaybackTarget } = require('./playerExecution.cjs');

// High-performance Chromium switches for lightning-fast cold-start, network caching & hardware acceleration
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disk-cache-size', '1073741824'); // 1 GB persistent disk cache
app.commandLine.appendSwitch('media-cache-size', '536870912'); // 512 MB media cache
app.commandLine.appendSwitch('enable-tcp-fast-open');
app.commandLine.appendSwitch('enable-features', 'NetworkService,ParallelDownloading,CanvasOopRasterization,SvgRasterPolicies');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

process.on('uncaughtException', err => {
  if (err && err.code === 'EADDRINUSE') {
    try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Ignored EADDRINUSE: ' + String(err?.message || err) + '\n'); } catch {}
    return;
  }
  try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), String(err?.stack || err) + '\n'); } catch {}
});
process.on('unhandledRejection', err => {
  if (err && err.code === 'EADDRINUSE') {
    try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Ignored EADDRINUSE rejection: ' + String(err?.message || err) + '\n'); } catch {}
    return;
  }
  try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), String(err?.stack || err) + '\n'); } catch {}
});

let win;
let googleAuthTask = null;
let googleAuthStatus = { state: 'idle', message: '', browser: '', updatedAt: Date.now() };
const webviewMetrics = new Map();
// Keep the advertised Chrome version in sync with the bundled Chromium.
// A pinned, stale version is rejected by Google as an insecure browser.
const defaultUserAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

function getYtmWebContents() {
  const all = require('electron').webContents.getAllWebContents();
  return all.find(wc => !wc.isDestroyed() && wc.getURL().includes('music.youtube.com'));
}

async function waitForYtmWebContents(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const contents = getYtmWebContents();
    if (contents) return contents;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return null;
}

function isGoogleAccountUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['accounts.google.com', 'accounts.youtube.com'].includes(url.hostname);
  } catch { return false; }
}

function isYouTubeAccountSwitcher(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['youtube.com', 'www.youtube.com'].includes(url.hostname) && url.pathname.startsWith('/channel_switcher');
  } catch { return false; }
}

function openGoogleAuthWindow(authUrl, switchAccount = false) {
  if (googleAuthTask) return googleAuthTask;
  const musicSession = session.fromPartition('persist:musicbot');
  const userData = path.resolve(app.getPath('userData'));
  const profileDir = path.join(userData, switchAccount ? 'google-auth-switch-profile' : 'google-auth-profile');
  if (switchAccount) {
    if (path.dirname(profileDir) !== userData) throw new Error('Ungültiger Pfad für das Google-Wechselprofil.');
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  googleAuthStatus = { state: 'running', message: '', browser: '', updatedAt: Date.now() };
  googleAuthTask = startGoogleAuth({
    profileDir,
    targetSession: musicSession,
    authUrl: switchAccount ? undefined : authUrl,
    replaceSession: switchAccount,
    onAuthenticated: async () => {
      const ytmWc = getYtmWebContents();
      if (ytmWc && !ytmWc.isDestroyed()) await ytmWc.loadURL('https://music.youtube.com/');
    }
  }).then(result => {
    googleAuthStatus = { state: 'authenticated', message: '', browser: result.browser, updatedAt: Date.now() };
    console.log(`[Auth] Google sign-in imported from ${result.browser} (${result.cookies} cookies).`);
    return result;
  }).catch(error => {
    console.error('[Auth] External Google sign-in failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    googleAuthStatus = { state: 'error', message, browser: '', updatedAt: Date.now() };
    return { error: message };
  }).finally(() => { googleAuthTask = null; });
  return googleAuthTask;
}

const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Quitting: requestSingleInstanceLock failed\n'); } catch {}
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    app.userAgentFallback = defaultUserAgent;
    // Use the Windows resolver instead of waiting for Chromium's automatic
    // DoH/HTTPS-record probes on networks that do not answer those requests.
    if (process.platform === 'win32') app.configureHostResolver({
      enableBuiltInResolver: false,
      secureDnsMode: 'off',
      enableAdditionalDnsQueryTypes: false
    });

    // Pre-warm partition session persist:musicbot for lightning-fast webview initialization
    try {
      const musicSession = session.fromPartition('persist:musicbot');
      musicSession.setUserAgent(defaultUserAgent);

      // Determine configured playback provider so we only preconnect to what is actually needed
      let configuredProvider = 'youtube_music';
      try {
        const cfgFile = path.join(__dirname, '../data/bot-config.json');
        if (require('fs').existsSync(cfgFile)) {
          const parsed = JSON.parse(require('fs').readFileSync(cfgFile, 'utf8'));
          if (parsed.playbackProvider) configuredProvider = parsed.playbackProvider;
        }
      } catch {}

      const ytmOrigins = [
        'https://music.youtube.com',
        'https://accounts.google.com',
        'https://i.ytimg.com',
        'https://lh3.googleusercontent.com',
        'https://yt3.ggpht.com',
        'https://fonts.gstatic.com',
        'https://fonts.googleapis.com'
      ];
      const spotifyOrigins = [
        'https://open.spotify.com',
        'https://accounts.spotify.com',
        'https://i.scdn.co',
        'https://open.spotifycdn.com',
        'https://audio-ak-spotify-com.akamaized.net',
        'https://dealer.spotify.com',
        'https://spclient.wg.spotify.com'
      ];
      // Only preconnect essential origins for the active provider to avoid socket/DNS contention
      const activeOrigins = configuredProvider === 'spotify'
        ? ['https://open.spotify.com', 'https://spclient.wg.spotify.com', 'https://dealer.spotify.com']
        : ['https://music.youtube.com', 'https://www.youtube.com', 'https://lh3.googleusercontent.com'];
      for (const origin of activeOrigins) {
        try { musicSession.preconnect({ url: origin, numSockets: 2 }); } catch {}
      }

      // Pre-set Google & YouTube cookie consent so YTM skips consent redirects
      const nowSecs = Math.floor(Date.now() / 1000);
      const expirationDate = nowSecs + (365 * 24 * 3600);
      const consentCookies = [
        { url: 'https://youtube.com', name: 'SOCS', value: 'CAESEwgDEgk2ODE4NDk2MjQaAmRlIAEaBgiAo_LzBg', domain: '.youtube.com', path: '/', expirationDate },
        { url: 'https://music.youtube.com', name: 'SOCS', value: 'CAESEwgDEgk2ODE4NDk2MjQaAmRlIAEaBgiAo_LzBg', domain: '.youtube.com', path: '/', expirationDate },
        { url: 'https://google.com', name: 'SOCS', value: 'CAESEwgDEgk2ODE4NDk2MjQaAmRlIAEaBgiAo_LzBg', domain: '.google.com', path: '/', expirationDate },
        { url: 'https://consent.youtube.com', name: 'SOCS', value: 'CAESEwgDEgk2ODE4NDk2MjQaAmRlIAEaBgiAo_LzBg', domain: '.youtube.com', path: '/', expirationDate },
        { url: 'https://youtube.com', name: 'CONSENT', value: 'PENDING+999', domain: '.youtube.com', path: '/', expirationDate },
        { url: 'https://music.youtube.com', name: 'CONSENT', value: 'PENDING+999', domain: '.youtube.com', path: '/', expirationDate },
        { url: 'https://google.com', name: 'CONSENT', value: 'PENDING+999', domain: '.google.com', path: '/', expirationDate }
      ];
      await Promise.allSettled(consentCookies.map(c => musicSession.cookies.set(c)));

      // Automatically grant mediaKeySystem (Widevine DRM for Spotify/YTM) and audio permissions
      musicSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = ['mediaKeySystem', 'media', 'audioCapture', 'notifications', 'pointerLock', 'fullscreen'];
        callback(allowed.includes(permission));
      });
      musicSession.setPermissionCheckHandler((webContents, permission) => {
        return ['mediaKeySystem', 'media', 'audioCapture', 'notifications', 'pointerLock', 'fullscreen'].includes(permission);
      });

    } catch (sesErr) {
      try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Session pre-warm error: ' + String(sesErr) + '\n'); } catch {}
    }

    win = new BrowserWindow({
      width: 1250,
      height: 900,
      minWidth: 960,
      minHeight: 500,
      title: 'Music Bot',
      backgroundColor: '#09090b',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: false, 
        nodeIntegration: true,
        webviewTag: true,
        backgroundThrottling: false
      }
    });

    win.setMenuBarVisibility(false);

    win.webContents.on('will-attach-webview', (_event, preferences) => {
      preferences.preload = path.join(__dirname, 'playerPreload.cjs');
      preferences.nodeIntegration = false;
      preferences.contextIsolation = true;
    });

    win.webContents.on('console-message', (event) => {
      const { message, lineNumber: line, sourceId } = event;
      try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-console.log'), `[Renderer] ${message} (${sourceId}:${line})\n`); } catch {}
    });

    win.webContents.on('did-attach-webview', (e, webContents) => {
      const wvId = webContents.id;
      const attachTime = Date.now();
      const metric = {
        id: wvId,
        url: '',
        name: 'Webview',
        attachTime,
        domReadyMs: null,
        finishLoadMs: null,
        status: 'attaching'
      };
      webviewMetrics.set(wvId, metric);
      webContents.on('ipc-message', (_event, channel) => {
        if (channel === 'player-content-ready') {
          metric.contentReadyMs = Date.now() - attachTime;
          metric.status = 'ready';
        }
      });
      webContents.once('destroyed', () => webviewMetrics.delete(wvId));

      webContents.on('did-start-loading', () => {
        metric.status = metric.contentReadyMs ? 'ready' : 'loading';
      });

      webContents.on('dom-ready', () => {
        metric.domReadyMs = Date.now() - attachTime;
        metric.url = webContents.getURL();
        if (metric.url.includes('music.youtube.com')) metric.name = 'YouTube Music';
        else if (metric.url.includes('spotify.com')) metric.name = 'Spotify';
        metric.status = 'dom-ready';
        const logMsg = `[Webview Performance] ${metric.name} (id: ${wvId}) DOM Ready in ${metric.domReadyMs}ms`;
        console.log(logMsg);
        try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-console.log'), logMsg + '\n'); } catch {}

        if (metric.url.includes('consent.youtube.com') || metric.url.includes('consent.google.com')) {
          webContents.executeJavaScript(`
            (() => {
              try {
                const btn = document.querySelector('form[action*="consent"] button') ||
                            document.querySelector('button[aria-label*="akzeptieren"]') ||
                            document.querySelector('button[aria-label*="Accept"]') ||
                            document.querySelector('button[aria-label*="Alle akzeptieren"]') ||
                            document.querySelector('form:last-of-type button');
                if (btn) btn.click();
              } catch {}
            })()
          `).catch(() => {});
        }
      });

      webContents.on('did-finish-load', () => {
        metric.finishLoadMs = Date.now() - attachTime;
        metric.url = webContents.getURL();
        if (metric.url.includes('music.youtube.com')) metric.name = 'YouTube Music';
        else if (metric.url.includes('spotify.com')) metric.name = 'Spotify';
        metric.status = 'ready';
        const logMsg = `[Webview Performance] ${metric.name} (id: ${wvId}) Fully Loaded in ${metric.finishLoadMs}ms`;
        console.log(logMsg);
        try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-console.log'), logMsg + '\n'); } catch {}
      });

      webContents.on('did-fail-load', (ev, errorCode, errorDescription, validatedURL) => {
        metric.status = 'failed';
        const logMsg = `[Webview Performance] ${metric.name} (id: ${wvId}) Load Failed (${errorCode}: ${errorDescription}) on ${validatedURL}`;
        console.warn(logMsg);
        try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-console.log'), logMsg + '\n'); } catch {}
      });

      webContents.on('will-navigate', (event, targetUrl) => {
        if (isGoogleAccountUrl(targetUrl)) {
          event.preventDefault();
          openGoogleAuthWindow(undefined, true);
          return;
        }
        if (isYouTubeAccountSwitcher(targetUrl)) {
          event.preventDefault();
          const accountWindow = new BrowserWindow({ width: 700, height: 800, parent: win, autoHideMenuBar: true,
            webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:musicbot' } });
          accountWindow.webContents.on('will-navigate', (navigationEvent, url) => {
            if (isGoogleAccountUrl(url)) {
              navigationEvent.preventDefault();
              openGoogleAuthWindow(undefined, true);
              accountWindow.close();
            }
          });
          accountWindow.loadURL(targetUrl).catch(() => {});
          accountWindow.on('closed', () => { if (!webContents.isDestroyed()) webContents.loadURL('https://music.youtube.com/').catch(() => {}); });
          return;
        }
        webContents.setUserAgent(defaultUserAgent);
      });

      webContents.on('did-navigate', (event, targetUrl) => {
        if (isGoogleAccountUrl(targetUrl)) {
          webContents.loadURL('https://music.youtube.com/').catch(() => {});
          return;
        }
        if (targetUrl.includes('consent.youtube.com') || targetUrl.includes('consent.google.com')) {
          webContents.executeJavaScript(`
            (() => {
              const tryClick = () => {
                const btn = document.querySelector('form[action*="consent"] button') ||
                            document.querySelector('button[aria-label*="akzeptieren"]') ||
                            document.querySelector('button[aria-label*="Accept"]') ||
                            document.querySelector('button[aria-label*="Alle akzeptieren"]') ||
                            document.querySelector('form:last-of-type button');
                if (btn) { btn.click(); return true; }
                return false;
              };
              if (!tryClick()) {
                const timer = setInterval(() => {
                  if (tryClick() || document.readyState === 'complete') clearInterval(timer);
                }, 50);
              }
            })()
          `).catch(() => {});
        }
        webContents.setUserAgent(defaultUserAgent);
        lastKnownState = null;
        lastKnownStateAt = 0;
      });

      webContents.on('did-navigate-in-page', (event, targetUrl, isMainFrame) => {
        if (isMainFrame && targetUrl.includes('music.youtube.com/watch')) {
          try {
            const nextVid = new URL(targetUrl).searchParams.get('v');
            if (nextVid && lastKnownState?.video?.id && nextVid !== lastKnownState.video.id) {
              lastKnownState = null;
              lastKnownStateAt = 0;
            }
          } catch {}
        }
      });

      webContents.on('did-create-window', (accountWindow, details) => {
        if (!isYouTubeAccountSwitcher(details.url)) return;
        accountWindow.webContents.on('will-navigate', (event, targetUrl) => {
          if (isGoogleAccountUrl(targetUrl)) {
            event.preventDefault();
            openGoogleAuthWindow(undefined, true);
            accountWindow.close();
          }
        });
        accountWindow.on('closed', () => {
          if (!webContents.isDestroyed()) webContents.loadURL('https://music.youtube.com/').catch(() => {});
        });
      });

      webContents.setWindowOpenHandler(({ url }) => {
        if (isGoogleAccountUrl(url)) {
          openGoogleAuthWindow(undefined, true);
          return { action: 'deny' };
        }
        if (isYouTubeAccountSwitcher(url)) {
          return { action: 'allow', overrideBrowserWindowOptions: { width: 700, height: 800, parent: win,
            autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:musicbot' } } };
        }
        if (url.includes('spotify.com')) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 600,
              height: 760,
              autoHideMenuBar: true,
              parent: win,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                partition: 'persist:musicbot'
              }
            }
          };
        }
        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
      });
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com')) {
        openGoogleAuthWindow(url);
        return { action: 'deny' };
      }
      if (url.includes('spotify.com')) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 600,
            height: 760,
            autoHideMenuBar: true,
            parent: win,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              partition: 'persist:musicbot'
            }
          }
        };
      }
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });

    app.on('browser-window-created', (ev, popupWin) => {
      popupWin.webContents.setUserAgent(defaultUserAgent);
    });

    const checkServer = () => {
      win.loadURL('http://127.0.0.1:3000/').catch(() => {
        setTimeout(checkServer, 150); 
      });
    };
    
    checkServer();

    win.on('closed', () => {
      win = null;
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

const http = require('http');

let lastKnownState = null;
let lastKnownStateAt = 0;
let lastKnownWebContentsId = 0;
const PLAYBACK_TRANSITION_GRACE_MS = 2000;

// Mock YTMDesktop Companion API on port 9863 so the bot backend can control the <webview> seamlessly
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const ytmWc = getYtmWebContents();

  if (req.url === '/api/v1/auth/google-status' && req.method === 'GET') {
    try {
      const musicSession = session.fromPartition('persist:musicbot');
      const cookies = await musicSession.cookies.get({});
      const authenticated = hasGoogleLogin(cookies);
      const status = authenticated && googleAuthStatus.state !== 'running'
        ? { ...googleAuthStatus, state: 'authenticated', message: '' }
        : googleAuthStatus;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ success: true, ...status, authenticated }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, state: 'error', authenticated: false, message: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (req.url === '/api/v1/auth/google-login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let authUrl;
        if (body) {
          try {
            const parsed = JSON.parse(body);
            if (parsed.url && isGoogleAccountUrl(parsed.url)) {
              authUrl = parsed.url;
            }
            var switchAccount = parsed.switchAccount === true;
          } catch {}
        }
        openGoogleAuthWindow(authUrl, switchAccount);
        res.writeHead(202, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ success: true, state: 'running' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.url === '/api/v1/auth/requestcode') {
     res.writeHead(200, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ code: '1234' }));
     return;
  }
  if (req.url === '/api/v1/auth/request') {
     res.writeHead(200, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ token: 'mock-token' }));
     return;
  }

  if (req.url === '/api/v1/performance') {
     res.writeHead(200, { 'Content-Type': 'application/json' });
     const list = Array.from(webviewMetrics.values());
     // Separate document/network time from first paint and SPA rendering.
     await Promise.all(list.map(async metric => {
       const wc = require('electron').webContents.fromId(metric.id);
       if (!wc || wc.isDestroyed()) return;
       let attached = false;
       try {
         if (wc.debugger.isAttached()) return;
         wc.debugger.attach('1.3');
         attached = true;
         metric.pageTiming = await Promise.race([
           wc.debugger.sendCommand('Runtime.evaluate', {returnByValue:true,expression:`(() => {
             const n = performance.getEntriesByType('navigation')[0];
             const paints = performance.getEntriesByType('paint').map(p => ({name:p.name,ms:Math.round(p.startTime)}));
             const slowResources = performance.getEntriesByType('resource').sort((a,b)=>b.duration-a.duration).slice(0,8).map(r=>({host:new URL(r.name).hostname,type:r.initiatorType,startMs:Math.round(r.startTime),durationMs:Math.round(r.duration)}));
             return {navigation:n ? {...Object.fromEntries(['workerStart','fetchStart','domainLookupStart','domainLookupEnd','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart','responseEnd','domInteractive','domContentLoadedEventEnd'].map(k=>[k+'Ms',Math.round(n[k])])),protocol:n.nextHopProtocol,transferSize:n.transferSize} : null,paints,slowResources};
           })()`}).then(result => result.result.value),
           new Promise(resolve => setTimeout(() => resolve(null), 1000))
         ]);
       } catch {} finally { if (attached && !wc.isDestroyed()) wc.debugger.detach(); }
     }));
     res.end(JSON.stringify({ uptime: process.uptime(), webviews: list }));
     return;
  }

  if (req.url === '/api/v1/debug') {
     res.writeHead(200, { 'Content-Type': 'application/json' });
     try {
       const all = require('electron').webContents.getAllWebContents();
       const list = all.map(wc => {
          try {
            return { id: wc.id, url: wc.getURL(), isDestroyed: wc.isDestroyed(), title: wc.getTitle(), userAgent: wc.getUserAgent() };
          } catch {
           return { id: wc.id, error: 'failed to inspect' };
         }
       });
       res.end(JSON.stringify({ webContents: list }));
     } catch (err) {
       res.end(JSON.stringify({ error: err.message }));
     }
     return;
  }

  if (req.url === '/api/v1/state') {
     if (!ytmWc) {
       res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '1' });
       res.end(JSON.stringify({ error: 'ytm_webview_starting' }));
       return;
     }
     res.writeHead(200, { 'Content-Type': 'application/json' });
     if (lastKnownWebContentsId !== ytmWc.id) {
       lastKnownState = null;
       lastKnownStateAt = 0;
       lastKnownWebContentsId = ytmWc.id;
     }
     const urlFallbackState = playbackStateFromUrl(ytmWc.getURL(), ytmWc.getTitle());
     try {
       // Read the timeline independently from the heavier metadata extractor.
       // This stays responsive even while YouTube replaces/rebuilds its player UI.
        const timelinePromise = ytmWc.executeJavaScript(String.raw`
          (() => {
            try {
              const bar = document.querySelector('ytmusic-player-bar');
              const musicPlayer = document.querySelector('ytmusic-player');
              const roots = [document, bar?.shadowRoot, musicPlayer?.shadowRoot].filter(Boolean);
              const findInRoots = (selector) => {
                for (const root of roots) {
                  try { const found = root.querySelector(selector); if (found) return found; } catch {}
                }
                return null;
              };
              const video = findInRoots('video.html5-main-video, video');
              const player = document.getElementById('movie_player') ||
                musicPlayer?.playerApi || bar?.playerApi ||
                (musicPlayer?.getPlayer ? musicPlayer.getPlayer() : null);

              const parseSecs = str => {
                if (!str) return null;
                const segs = str.trim().split(':').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
                if (segs.length === 2) return segs[0] * 60 + segs[1];
                if (segs.length === 3) return segs[0] * 3600 + segs[1] * 60 + segs[2];
                return null;
              };

              let canonicalDuration = 0;
              try {
                const resp = player?.getPlayerResponse ? player.getPlayerResponse() : null;
                const len = parseInt(resp?.videoDetails?.lengthSeconds, 10);
                if (Number.isFinite(len) && len > 0) canonicalDuration = len;
              } catch {}
              if (!canonicalDuration) {
                try {
                  const details = window.ytInitialPlayerResponse?.videoDetails || window.ytplayer?.config?.args?.raw_player_response?.videoDetails;
                  const len = parseInt(details?.lengthSeconds, 10);
                  if (Number.isFinite(len) && len > 0) canonicalDuration = len;
                } catch {}
              }

              let timeInfoProgress = null;
              let timeInfoDuration = null;
              const timeCandidates = [
                findInRoots('.time-info, ytmusic-player-bar .time-info, [class*="time-info"]'),
                document.querySelector('ytmusic-player-bar .time-info'),
                document.querySelector('.time-info')
              ].filter(Boolean);
              if (bar?.shadowRoot) {
                try { timeCandidates.push(...bar.shadowRoot.querySelectorAll('.time-info, [class*="time-info"]')); } catch {}
              }
              for (const node of timeCandidates) {
                const match = (node?.textContent || '').match(/(\d+:\d+(?::\d+)?)\s*\/\s*(\d+:\d+(?::\d+)?)/);
                if (match) {
                  const p = parseSecs(match[1]);
                  const d = parseSecs(match[2]);
                  if (d !== null && d > 0) {
                    timeInfoProgress = p;
                    timeInfoDuration = d;
                    if (!canonicalDuration) canonicalDuration = d;
                    break;
                  }
                }
              }

              const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
              const hasApi = player && typeof player.getDuration === 'function' && finite(player.getDuration()) > 0;
              const apiDuration = hasApi ? finite(player.getDuration()) : 0;
              const apiProgress = player && typeof player.getCurrentTime === 'function' ? Number(player.getCurrentTime()) : NaN;

              let finalDuration = 0;
              let finalProgress = 0;
              if (canonicalDuration > 0) {
                finalDuration = canonicalDuration;
                if (Number.isFinite(apiProgress) && apiProgress >= 0) finalProgress = apiProgress;
                else if (timeInfoProgress !== null && timeInfoProgress >= 0) finalProgress = timeInfoProgress;
                else if (video && finite(video.currentTime) >= 0) finalProgress = finite(video.currentTime);
              } else if (timeInfoDuration !== null && timeInfoDuration > 0) {
                finalDuration = timeInfoDuration;
                finalProgress = timeInfoProgress !== null ? timeInfoProgress : 0;
              } else if (hasApi) {
                finalDuration = apiDuration;
                finalProgress = Number.isFinite(apiProgress) && apiProgress >= 0 ? apiProgress : 0;
              } else if (video && finite(video.duration) > 0) {
                finalDuration = finite(video.duration);
                finalProgress = finite(video.currentTime);
              }
              finalProgress = finalDuration > 0 ? Math.min(finalDuration, Math.max(0, finalProgress)) : Math.max(0, finalProgress);

              const apiVolume = player && typeof player.getVolume === 'function' ? finite(player.getVolume()) : NaN;
              const metadata = navigator.mediaSession?.metadata;
              const artwork = Array.isArray(metadata?.artwork) && metadata.artwork.length ? metadata.artwork[metadata.artwork.length - 1]?.src || '' : '';
              const artworkId = artwork.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)?.[1] || '';
              return {
                progress: finalProgress,
                duration: finalDuration,
                volume: Number.isFinite(apiVolume) ? apiVolume : (video ? finite(video.volume) * 100 : 50),
                isPaused: video ? Boolean(video.paused) : (player && typeof player.getPlayerState === 'function' ? player.getPlayerState() !== 1 : false),
                title: metadata?.title || '', author: metadata?.artist || '', cover: artwork, id: artworkId
              };
            } catch { return null; }
          })()
        `).catch(() => null);
       const statePromise = ytmWc.executeJavaScript(`
         (() => {
           try {
             const playerBar = document.querySelector('ytmusic-player-bar');
             const musicPlayer = document.querySelector('ytmusic-player');
             const roots = [document, playerBar?.shadowRoot, musicPlayer?.shadowRoot].filter(Boolean);
             const findInRoots = (selector) => {
               for (const root of roots) {
                 try { const found = root.querySelector(selector); if (found) return found; } catch {}
               }
               return null;
             };
             const v = findInRoots('video.html5-main-video, video');
             const titleNode = findInRoots('ytmusic-player-bar .title, ytmusic-player-bar yt-formatted-string.title, .title.ytmusic-player-bar');
             const bylineNode = findInRoots('ytmusic-player-bar .byline, .byline.ytmusic-player-bar');
             const title = titleNode?.textContent?.trim() || '';
             const bylineLink = bylineNode?.querySelector?.('a');
             const bylineFull = bylineNode?.textContent?.trim() || '';
             const cleanBylineAuthor = bylineLink ? bylineLink.textContent.trim() : (bylineFull.split('•')[0] || '').trim();
             const cover = findInRoots('ytmusic-player-bar img.image, img.image.ytmusic-player-bar')?.src || '';
             
             let metaTitle = '';
             let metaAuthor = '';
             let metaCover = '';
             if (navigator.mediaSession && navigator.mediaSession.metadata) {
               metaTitle = navigator.mediaSession.metadata.title || '';
               metaAuthor = navigator.mediaSession.metadata.artist || '';
               const artwork = navigator.mediaSession.metadata.artwork;
               if (Array.isArray(artwork) && artwork.length > 0) {
                 metaCover = artwork[artwork.length - 1].src || '';
               }
             }

              let vidId = '';
              let videoData = null;
              let player = null;
              try {
                player = document.getElementById('movie_player') ||
                  musicPlayer?.playerApi || playerBar?.playerApi ||
                  (musicPlayer?.getPlayer ? musicPlayer.getPlayer() : null);
                if (player && typeof player.getVideoData === 'function') {
                  videoData = player.getVideoData();
                  vidId = videoData?.video_id || '';
                }
              } catch {}

              if (!videoData) {
                try {
                  const details = window.ytInitialPlayerResponse?.videoDetails || window.ytplayer?.config?.args?.raw_player_response?.videoDetails;
                  if (details) {
                    videoData = { video_id: details.videoId || '', title: details.title || '', author: details.author || '' };
                    vidId = videoData.video_id;
                  }
                } catch {}
              }

              const adSelector = '.ad-showing, .ad-interrupting, .ytp-ad-player-overlay, .ytmusic-ad-badge, .ytp-ad-text, .ytp-ad-preview-container';
              const isAdDom = Boolean(document.querySelector(adSelector));
              const isAdApi = Boolean(player && typeof player.getAdState === 'function' && player.getAdState() === 1);
              const isAd = isAdDom || isAdApi;

              if (isAd) {
                try {
                  const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytmusic-ad-skip-button, button.ytp-ad-skip-button-modern');
                  if (skipBtn) skipBtn.click();
                } catch {}
              }
              
              if (!vidId && (cover || metaCover)) {
                const targetCover = cover || metaCover;
                const match = targetCover.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
                if (match) vidId = match[1];
              }
              if (!vidId && player && typeof player.getVideoUrl === 'function') {
                try {
                  const urlStr = player.getVideoUrl();
                  if (urlStr) {
                    const match = urlStr.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                    if (match) vidId = match[1];
                  }
                } catch {}
              }
              if (!vidId) {
                try {
                  const titleLink = findInRoots('ytmusic-player-bar .title a, ytmusic-player-bar yt-formatted-string.title a, .title.ytmusic-player-bar a');
                  const href = titleLink?.getAttribute?.('href') || titleLink?.href || '';
                  const match = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                  if (match) vidId = match[1];
                } catch {}
              }
              if (!vidId) {
                try { vidId = new URLSearchParams(window.location.search).get('v') || ''; } catch {}
              }
              let requestedVidId = '';
              try {
                const radioList = new URLSearchParams(window.location.search).get('list') || '';
                const radioMatch = radioList.match(/^RDAMVM([a-zA-Z0-9_-]{11})$/);
                if (radioMatch) requestedVidId = radioMatch[1];
              } catch {}
               
              const cleanDocumentTitle = (${titleFromDocument.toString()})(document.title || '');
              const finalTitle = metaTitle || videoData?.title || title || cleanDocumentTitle || '';
              const finalAuthor = metaAuthor || videoData?.author || cleanBylineAuthor || bylineFull || '';
              const finalVidId = videoData?.video_id || vidId || '';
              const finalCover = metaCover || cover || (finalVidId ? 'https://img.youtube.com/vi/' + finalVidId + '/hqdefault.jpg' : '');

              // Calculate duration & progress with multiple robust fallbacks (prefer canonical player response & timeInfo over raw MSE video element)
              const parseSecs = (str) => {
                if (!str) return 0;
                const segments = str.trim().split(':').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
                if (segments.length === 2) return segments[0] * 60 + segments[1];
                if (segments.length === 3) return segments[0] * 3600 + segments[1] * 60 + segments[2];
                return 0;
              };

              let canonicalDuration = 0;
              try {
                const resp = player?.getPlayerResponse ? player.getPlayerResponse() : null;
                const len = parseInt(resp?.videoDetails?.lengthSeconds, 10);
                if (Number.isFinite(len) && len > 0) canonicalDuration = len;
              } catch {}
              if (!canonicalDuration) {
                try {
                  const details = window.ytInitialPlayerResponse?.videoDetails || window.ytplayer?.config?.args?.raw_player_response?.videoDetails;
                  const len = parseInt(details?.lengthSeconds, 10);
                  if (Number.isFinite(len) && len > 0) canonicalDuration = len;
                } catch {}
              }

              let timeInfoDuration = 0;
              let timeInfoProgress = 0;
              try {
                const timeCandidates = [
                  findInRoots('.time-info, ytmusic-player-bar .time-info, [class*="time-info"]'),
                  document.querySelector('ytmusic-player-bar .time-info'),
                  document.querySelector('.time-info')
                ].filter(Boolean);
                if (playerBar?.shadowRoot) {
                  try { timeCandidates.push(...playerBar.shadowRoot.querySelectorAll('.time-info, [class*="time-info"]')); } catch {}
                }
                for (const node of timeCandidates) {
                  const match = (node?.textContent || '').match(/(\d+:\d+(?::\d+)?)\s*\/\s*(\d+:\d+(?::\d+)?)/);
                  if (match) {
                    const dur = parseSecs(match[2]);
                    if (dur > 0) {
                      timeInfoDuration = dur;
                      timeInfoProgress = parseSecs(match[1]);
                      if (!canonicalDuration) canonicalDuration = dur;
                      break;
                    }
                  }
                }
              } catch {}

              let rawDuration = 0;
              let rawProgress = 0;
              if (canonicalDuration > 0) {
                rawDuration = canonicalDuration;
                if (player && typeof player.getCurrentTime === 'function' && Number.isFinite(player.getCurrentTime())) {
                  rawProgress = player.getCurrentTime();
                } else if (v && Number.isFinite(v.currentTime) && v.currentTime >= 0) {
                  rawProgress = v.currentTime;
                } else if (timeInfoProgress > 0) {
                  rawProgress = timeInfoProgress;
                }
              } else if (timeInfoDuration > 0) {
                rawDuration = timeInfoDuration;
                rawProgress = timeInfoProgress;
              } else if (player && typeof player.getDuration === 'function' && Number.isFinite(player.getDuration()) && player.getDuration() > 0) {
                rawDuration = player.getDuration();
                if (typeof player.getCurrentTime === 'function' && Number.isFinite(player.getCurrentTime())) {
                  rawProgress = player.getCurrentTime();
                }
              } else if (v && Number.isFinite(v.duration) && v.duration > 0) {
                rawDuration = v.duration;
                if (Number.isFinite(v.currentTime) && v.currentTime >= 0) rawProgress = v.currentTime;
              }
              const duration = Math.max(0, Math.round(rawDuration));
              const progress = duration > 0 ? Math.min(duration, Math.max(0, Math.round(rawProgress))) : Math.max(0, Math.round(rawProgress));

              let playerVol = 50;
              if (player && typeof player.getVolume === 'function') {
                try { playerVol = Math.round(player.getVolume()); } catch {}
              } else if (v && Number.isFinite(v.volume)) {
                playerVol = Math.round(v.volume * 100);
              }

              if (!v && !player) {
                if (finalVidId || (metaTitle && (duration > 0 || progress > 0))) {
                  const mediaPaused = navigator.mediaSession?.playbackState === 'paused' || navigator.mediaSession?.playbackState === 'none';
                  return {
                    player: { hasSong: true, isPaused: mediaPaused, trackState: mediaPaused ? 2 : 1, volume: playerVol, videoProgress: progress, duration, durationSeconds: duration, adPlaying: isAd },
                    video: isAd ? null : { title: finalTitle || 'Loading...', author: finalAuthor || '', id: finalVidId, requestedId: requestedVidId, cover: finalCover, duration, durationSeconds: duration }
                  };
                }
                return null;
              }
              const isPaused = v ? v.paused : (player && typeof player.getPlayerState === 'function' ? player.getPlayerState() !== 1 : false);
              const hasSong = Boolean(finalVidId || ((metaTitle || title || cleanDocumentTitle) && (duration > 0 || progress > 0)));
              return {
                player: {
                  hasSong,
                  isPaused,
                  trackState: isPaused ? 2 : 1,
                  volume: playerVol,
                  videoProgress: progress,
                  duration,
                  durationSeconds: duration,
                  adPlaying: isAd
                },
                video: (!isAd && hasSong) ? {
                  title: finalTitle || 'YouTube Music Track',
                  author: finalAuthor || 'YouTube Music',
                  id: finalVidId || '',
                  requestedId: requestedVidId,
                  cover: finalCover,
                  duration,
                  durationSeconds: duration
                } : null
              };
            } catch (e) {
              return null;
            }
          })()
        `);
       const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
       const timeline = await Promise.race([timelinePromise, new Promise(resolve => setTimeout(() => resolve(null), 1000))]);
       const state = await Promise.race([statePromise, timeoutPromise]);
       if (state && !state.player?.adPlaying && (state.video || state.player?.hasSong)) {
         lastKnownState = state;
         lastKnownStateAt = Date.now();
       }
       if (state?.player?.adPlaying && lastKnownState?.video) {
         res.end(JSON.stringify({
           ...state,
           video: lastKnownState.video
         }));
         return;
       }
       const usableState = state && (state.video || state.player?.hasSong) ? state : null;
        const isOldTrackEnded = Boolean(
          lastKnownState &&
          lastKnownState.player?.duration > 0 &&
          lastKnownState.player?.videoProgress >= (lastKnownState.player?.duration - 2)
        );
        const freshLastKnownState = (!isOldTrackEnded && (Date.now() - lastKnownStateAt <= PLAYBACK_TRANSITION_GRACE_MS)) ? lastKnownState : null;
        const timelineState = playbackStateFromTimeline(timeline);
        const baseState = usableState || urlFallbackState || timelineState || freshLastKnownState || { player: { hasSong: false, isPaused: true, trackState: 2, volume: 50, videoProgress: 0, duration: 0, durationSeconds: 0, adPlaying: false }, video: null };
        res.end(JSON.stringify(mergePlaybackTimeline(baseState, timeline)));
      } catch {
        const timeline = await Promise.race([
          ytmWc.executeJavaScript(`(() => {
            const v=document.querySelector('video.html5-main-video, video');
            const p=document.getElementById('movie_player');
            const m=navigator.mediaSession?.metadata;
            const a=Array.isArray(m?.artwork)&&m.artwork.length?m.artwork[m.artwork.length-1]?.src||'':'';
            const id=a.match(/\\/vi\\/([a-zA-Z0-9_-]{11})\\//)?.[1]||'';
            const pd=Number(p?.getDuration?.() || 0);
            const respLen=parseInt(p?.getPlayerResponse?.()?.videoDetails?.lengthSeconds, 10);
            const dur=respLen > 0 ? respLen : (pd > 0 ? pd : Number(v?.duration || 0));
            const pt=Number(p?.getCurrentTime?.() || 0);
            const prog=dur > 0 ? Math.min(dur, Math.max(0, pt > 0 ? pt : Number(v?.currentTime || 0))) : Math.max(0, pt > 0 ? pt : Number(v?.currentTime || 0));
            return {
              progress: prog,
              duration: dur,
              volume: Number(p?.getVolume?.() ?? ((v?.volume ?? .5)*100)),
              isPaused: v ? v.paused : p?.getPlayerState?.() !== 1,
              title: m?.title || '',
              author: m?.artist || '',
              cover: a,
              id
            };
          })()`).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 1000))
        ]);
        const timelineState = playbackStateFromTimeline(timeline);
        const isOldTrackEnded = Boolean(
          lastKnownState &&
          lastKnownState.player?.duration > 0 &&
          lastKnownState.player?.videoProgress >= (lastKnownState.player?.duration - 2)
        );
        const freshLastKnownState = (!isOldTrackEnded && (Date.now() - lastKnownStateAt <= PLAYBACK_TRANSITION_GRACE_MS)) ? lastKnownState : null;
        const baseState = urlFallbackState || timelineState || freshLastKnownState || { player: { hasSong: false, isPaused: true, trackState: 2, volume: 50, videoProgress: 0, duration: 0, durationSeconds: 0, adPlaying: false }, video: null };
        res.end(JSON.stringify(mergePlaybackTimeline(baseState, timeline)));
      }
     return;
  }

  if (req.url === '/api/v1/command' && req.method === 'POST') {
     let body = '';
     req.on('data', chunk => { body += chunk.toString(); });
     req.on('end', async () => {
       res.writeHead(200, { 'Content-Type': 'application/json' });
       const targetWc = getYtmWebContents() || await waitForYtmWebContents();
       if (!targetWc) {
         try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Command error: no active ytm webContents found\n'); } catch {}
         res.end(JSON.stringify({ success: false, error: 'no_active_ytm_webContents' }));
         return;
       }
       try {
         const { command, data } = JSON.parse(body);
         let cmdResult = null;
         if (command === 'playPause') {
           cmdResult = await targetWc.executeJavaScript(`
             (() => {
               try {
                 const player = document.getElementById('movie_player') || (document.querySelector('ytmusic-player')?.getPlayer ? document.querySelector('ytmusic-player').getPlayer() : null);
                 const v = document.querySelector('video');
                 if (v) {
                   if (v.paused) {
                     if (player && typeof player.playVideo === 'function') {
                       try { player.playVideo(); return { ok: true }; } catch {}
                     }
                     v.play().catch(() => {});
                   } else {
                     if (player && typeof player.pauseVideo === 'function') {
                       try { player.pauseVideo(); return { ok: true }; } catch {}
                     }
                     v.pause();
                   }
                 } else if (player) {
                   if (typeof player.getPlayerState === 'function' && player.getPlayerState() === 1) {
                     player.pauseVideo();
                   } else if (typeof player.playVideo === 'function') {
                     player.playVideo();
                   }
                 }
                 return { ok: true };
               } catch (e) {
                 return { ok: false, error: String(e) };
               }
             })()
           `);
         }
         if (command === 'play') {
           cmdResult = await targetWc.executeJavaScript(`
             (() => {
               try {
                 const player = document.getElementById('movie_player') || (document.querySelector('ytmusic-player')?.getPlayer ? document.querySelector('ytmusic-player').getPlayer() : null);
                 if (player && typeof player.playVideo === 'function') {
                   try { player.playVideo(); return { ok: true }; } catch {}
                 }
                 document.querySelector('video')?.play().catch(() => {});
                 return { ok: true };
               } catch (e) {
                 return { ok: false, error: String(e) };
               }
             })()
           `);
         }
         if (command === 'pause') {
           cmdResult = await targetWc.executeJavaScript(`
             (() => {
               try {
                 const player = document.getElementById('movie_player') || (document.querySelector('ytmusic-player')?.getPlayer ? document.querySelector('ytmusic-player').getPlayer() : null);
                 if (player && typeof player.pauseVideo === 'function') {
                   try { player.pauseVideo(); return { ok: true }; } catch {}
                 }
                 document.querySelector('video')?.pause();
                 return { ok: true };
               } catch (e) {
                 return { ok: false, error: String(e) };
               }
             })()
           `);
         }
          if (command === 'next') {
            cmdResult = await targetWc.executeJavaScript(`
              (() => {
                try {
                  const player = document.getElementById('movie_player') || (document.querySelector('ytmusic-player')?.getPlayer ? document.querySelector('ytmusic-player').getPlayer() : null);
                  const nextBtn = document.querySelector('ytmusic-player-bar .next-button') || document.querySelector('.next-button') || document.querySelector('#next-button');
                  const nextControl = nextBtn?.querySelector('button') || nextBtn;
                  const isBtnDisabled = nextControl ? (nextControl.hasAttribute('disabled') || nextControl.getAttribute('aria-disabled') === 'true' || nextControl.classList.contains('disabled')) : true;

                  // A player API can expose nextVideo even without a radio queue.
                  // Use a visible enabled control first so a no-op is not reported
                  // as a successful skip.
                  if (nextBtn && !isBtnDisabled) {
                    nextControl.click();
                    return { ok: true, method: 'nextBtn.click' };
                  }

                  const queueItems = Array.from(document.querySelectorAll('ytmusic-player-queue-item'));
                  const activeIndex = queueItems.findIndex(el => el.hasAttribute('selected') || el.classList.contains('selected'));
                  if (queueItems.length > 0 && activeIndex >= 0 && activeIndex < queueItems.length - 1) {
                    queueItems[activeIndex + 1].click();
                    return { ok: true, method: 'queueItem.click' };
                  }

                  const playlist = typeof player?.getPlaylist === 'function' ? player.getPlaylist() : null;
                  const playlistIndex = typeof player?.getPlaylistIndex === 'function' ? player.getPlaylistIndex() : -1;
                  if (Array.isArray(playlist) && playlistIndex >= 0 && playlistIndex < playlist.length - 1 && typeof player.nextVideo === 'function') {
                    player.nextVideo();
                    return { ok: true, method: 'player.nextVideo' };
                  }

                  return { ok: false, error: 'no_next_track' };
                } catch (e) {
                  return { ok: false, error: String(e) };
                }
              })()
            `);
          }
          if (command === 'previous') {
            cmdResult = await targetWc.executeJavaScript(`
              (() => {
                try {
                  const player = document.getElementById('movie_player') || (document.querySelector('ytmusic-player')?.getPlayer ? document.querySelector('ytmusic-player').getPlayer() : null);
                  const prevBtn = document.querySelector('ytmusic-player-bar .previous-button') || document.querySelector('.previous-button') || document.querySelector('#previous-button');
                  const isBtnDisabled = prevBtn ? (prevBtn.hasAttribute('disabled') || prevBtn.getAttribute('aria-disabled') === 'true' || prevBtn.classList.contains('disabled')) : true;

                  const v = document.querySelector('video');
                  if (v && v.currentTime > 3) {
                    v.currentTime = 0;
                    v.play().catch(() => {});
                    return { ok: true, method: 'video.rewind' };
                  }

                  // 1. If player.previousVideo function exists, call it
                  if (player && typeof player.previousVideo === 'function') {
                    try {
                      player.previousVideo();
                      return { ok: true, method: 'player.previousVideo' };
                    } catch {}
                  }

                  // 2. Click the previous button if present and not disabled
                  if (prevBtn && !isBtnDisabled) {
                    const btn = prevBtn.querySelector('button') || prevBtn;
                    btn.click();
                    return { ok: true, method: 'prevBtn.click' };
                  }

                  // 3. Try clicking previous queue item if side queue is rendered
                  const queueItems = Array.from(document.querySelectorAll('ytmusic-player-queue-item'));
                  const activeIndex = queueItems.findIndex(el => el.hasAttribute('selected') || el.classList.contains('selected'));
                  if (queueItems.length > 0 && activeIndex > 0) {
                    queueItems[activeIndex - 1].click();
                    return { ok: true, method: 'queueItem.click' };
                  }

                  // 4. Fallback click prevBtn
                  if (prevBtn) {
                    const btn = prevBtn.querySelector('button') || prevBtn;
                    btn.click();
                    return { ok: true, method: 'fallback_prevBtn.click' };
                  }

                  // 5. Fallback: rewind video to start
                  if (v) {
                    v.currentTime = 0;
                    v.play().catch(() => {});
                    return { ok: true, method: 'video.rewind_start' };
                  }

                  return { ok: true };
                } catch (e) {
                  return { ok: false, error: String(e) };
                }
              })()
            `);
          }
         if (command === 'setVolume') {
           const safeVol = Math.max(0, Math.min(100, Math.round(Number(data) || 0)));
           cmdResult = await targetWc.executeJavaScript(`
             (() => {
               try {
                 const vol = ${safeVol};
                 const player = document.getElementById('movie_player') || (document.querySelector('ytmusic-player')?.getPlayer ? document.querySelector('ytmusic-player').getPlayer() : null);
                 let playerSet = false;
                 if (player && typeof player.setVolume === 'function') {
                   try {
                     player.setVolume(vol);
                     if (vol > 0 && typeof player.unMute === 'function') player.unMute();
                     if (vol === 0 && typeof player.mute === 'function') player.mute();
                     playerSet = true;
                   } catch (pe) {}
                 }
                 const v = document.querySelector('video');
                 let videoSet = false;
                 if (v) {
                   try {
                     v.volume = vol / 100;
                     v.muted = (vol === 0);
                     videoSet = true;
                   } catch (ve) {}
                 }
                 const slider = document.querySelector('ytmusic-player-bar #volume-slider');
                 if (slider) {
                   try {
                     slider.value = vol;
                   } catch (se) {}
                 }
                 const actualPlayerVol = player && typeof player.getVolume === 'function' ? player.getVolume() : null;
                 const actualVideoVol = v ? v.volume : null;
                 return { ok: true, requested: vol, playerSet, videoSet, actualPlayerVol, actualVideoVol };
               } catch (e) {
                 return { ok: false, error: String(e) };
               }
             })()
           `);
          }
          if (command === 'changeVideo') {
            const vid = typeof data?.videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(data.videoId) ? data.videoId : '';
            if (!vid) {
              res.end(JSON.stringify({ success: false, error: 'invalid_video_id' }));
              return;
            }
            const autoplayRadio = data?.autoplayRadio !== false;
            const playbackTarget = youtubePlaybackTarget(vid, autoplayRadio);
            const playbackUrl = playbackTarget.url;
            
            // Invalidate stale cached state immediately so the old track is not reported
            lastKnownState = null;
            lastKnownStateAt = 0;

            // Radio requests need a canonical playlist URL. Loading only the
            // video in the page can leave the Next button without a radio queue.
            let loadedInPage = false;
            if (playbackTarget.useInPagePlayer) try {
              loadedInPage = await targetWc.executeJavaScript(`
                (() => {
                  try {
                    const musicPlayer = document.querySelector('ytmusic-player');
                    const playerBar = document.querySelector('ytmusic-player-bar');
                    const player = document.getElementById('movie_player') ||
                      musicPlayer?.playerApi || playerBar?.playerApi ||
                      (musicPlayer?.getPlayer ? musicPlayer.getPlayer() : null);
                    if (player && typeof player.loadVideoById === 'function') {
                      const loadArgs = { videoId: ${JSON.stringify(vid)} };
                      try {
                        player.loadVideoById(loadArgs);
                      } catch {
                        player.loadVideoById(${JSON.stringify(vid)});
                      }
                      if (typeof player.playVideo === 'function') {
                        player.playVideo();
                      }
                      return true;
                    }
                  } catch {}
                  return false;
                })()
              `);
            } catch {
              loadedInPage = false;
            }

            if (!loadedInPage) {
              // A top-level load can be aborted by YouTube Music's own SPA
              // navigation. In that case the old song may continue playing,
              // despite the command having been accepted by this API.
              const requestedVideoReached = () => {
                try {
                  const current = new URL(targetWc.getURL());
                  return current.searchParams.get('v') === vid;
                } catch { return false; }
              };
              const loadInPageAfterNavigation = async () => {
                if (targetWc.isDestroyed()) return;
                try {
                  const recovered = await targetWc.executeJavaScript(`
                    (() => {
                      try {
                        const musicPlayer = document.querySelector('ytmusic-player');
                        const playerBar = document.querySelector('ytmusic-player-bar');
                        const player = document.getElementById('movie_player') ||
                          musicPlayer?.playerApi || playerBar?.playerApi ||
                          (musicPlayer?.getPlayer ? musicPlayer.getPlayer() : null);
                        if (!player || typeof player.loadVideoById !== 'function') return false;
                        const playingId = player.getVideoData?.()?.video_id ||
                          player.getPlayerResponse?.()?.videoDetails?.videoId || '';
                        const urlId = new URLSearchParams(location.search).get('v') || '';
                        if (playingId === ${JSON.stringify(vid)}) return true;
                        if (playingId && playingId === urlId &&
                            (urlId === ${JSON.stringify(vid)} ||
                              new URLSearchParams(location.search).get('list') === 'RDAMVM' + ${JSON.stringify(vid)})) return true;
                        try { player.loadVideoById(${JSON.stringify(vid)}); }
                        catch { player.loadVideoById({ videoId: ${JSON.stringify(vid)} }); }
                        if (typeof player.playVideo === 'function') player.playVideo();
                        return true;
                      } catch { return false; }
                    })()
                  `);
                  if (!recovered) throw new Error('player_api_unavailable');
                } catch (fallbackErr) {
                  try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'changeVideo fallback error: ' + String(fallbackErr) + '\n'); } catch {}
                }
              };
              void targetWc.loadURL(playbackUrl).then(() => {
                if (!requestedVideoReached()) void loadInPageAfterNavigation();
              }).catch(urlErr => {
                if (!requestedVideoReached()) {
                  try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'loadURL error: ' + String(urlErr) + '\n'); } catch {}
                  void loadInPageAfterNavigation();
                }
              });
              // A resolved navigation can still leave the old player active.
              setTimeout(() => { void loadInPageAfterNavigation(); }, 3000);
            }

            setTimeout(async () => {
              try {
                await targetWc.executeJavaScript(`
                  (() => {
                    try {
                      const v = document.querySelector('video');
                      if (v && v.paused) v.play().catch(() => {});
                      const musicPlayer = document.querySelector('ytmusic-player');
                      const playerBar = document.querySelector('ytmusic-player-bar');
                      const player = document.getElementById('movie_player') ||
                        musicPlayer?.playerApi || playerBar?.playerApi ||
                        (musicPlayer?.getPlayer ? musicPlayer.getPlayer() : null);
                      if (player && typeof player.playVideo === 'function') player.playVideo();
                    } catch {}
                  })()
                `);
              } catch {}
            }, 1000);

            cmdResult = { ok: true, method: loadedInPage ? 'in_page_player' : 'canonical_navigation', videoId: vid, autoplayRadio };
          }
         res.end(JSON.stringify({ success: Boolean(cmdResult?.ok), result: cmdResult, ...(!cmdResult?.ok ? { error: cmdResult?.error || 'command_failed' } : {}) }));
       } catch (err) {
         try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Command exception: ' + String(err?.stack || err) + '\n'); } catch {}
         res.end(JSON.stringify({ success: false, error: err.message }));
       }
     });
     return;
  }

  res.writeHead(404);
  res.end();
});

if (isPrimaryInstance) {
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn('[YTM Mock Server] Port 9863 is already in use; keeping the existing companion.');
      try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Companion port busy; reusing existing listener\n'); } catch {}
      return;
    }
    console.error('[YTM Mock Server] Error on companion port 9863:', err?.message || err);
    try { require('fs').appendFileSync(path.join(__dirname, '../data/electron-crash.log'), 'Companion server error: ' + String(err?.stack || err) + '\n'); } catch {}
  });
  const stopCompanionServer = () => {
    if (!server.listening) return;
    try { server.close(); } catch {}
  };
  app.on('before-quit', stopCompanionServer);
  app.on('will-quit', stopCompanionServer);
  server.listen(9863, '127.0.0.1');
}
