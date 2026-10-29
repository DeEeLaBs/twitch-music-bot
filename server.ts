import './src/server/netDefaults.ts';
import { createArtworkProxyRouter } from './src/server/artworkProxy.ts';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { botService } from './src/server/botService.ts';
import { flushScheduledWrites } from './src/server/atomicStore.ts';
import crypto from 'node:crypto';
import { pluginManager } from './src/server/pluginManager.ts';
import { logger } from './src/server/logger.ts';
import { createApiRouter } from './src/server/apiRouter.ts';
import { BotError, errorPayload } from './src/server/errors.ts';
import { isLocalDashboardRequest } from './src/server/localAccess.ts';

const PORT = 3000;
const APP_VERSION = (() => {
  try {
    const packageInfo = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return packageInfo.version || 'unknown';
  } catch { return 'unknown'; }
})();
const app = express();
const sessionToken = crypto.randomBytes(24).toString('hex');
app.disable('x-powered-by');
const allowedHosts = new Set(['localhost:3000', '127.0.0.1:3000']);
function localRequest(req: http.IncomingMessage) {
  return isLocalDashboardRequest(req);
}
const parentPid = Number(process.env.MUSICBOT_PARENT_PID || 0);
if (parentPid > 0) {
  // The desktop launcher kills this supervisor with TerminateProcess, which
  // does not stop a Windows child. Exit when that parent is gone.
  const watch = setInterval(() => {
    try { process.kill(parentPid, 0); } catch { clearInterval(watch); process.exit(0); }
  }, 1000);
  watch.unref();
}
app.use((req, res, next) => { const spotifyCallback=req.path==='/auth/spotify/callback' && allowedHosts.has(req.headers.host || ''); if (!spotifyCallback && !localRequest(req)) { res.status(403).json({ error: 'Nur lokale Zugriffe sind erlaubt.' }); return; } res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.json({ limit: '20mb' }));
const overlayAssetsDir = path.join(process.cwd(), 'data', 'overlay-assets');
fs.mkdirSync(overlayAssetsDir, { recursive: true });
const overlayFontTypes: Record<string, string> = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
app.use('/overlay-assets', express.static(overlayAssetsDir, {
  fallthrough: false,
  immutable: false,
  maxAge: '1h',
  setHeaders(res, filePath) {
    const type = overlayFontTypes[path.extname(filePath).toLowerCase()];
    if (type) res.setHeader('Content-Type', type);
  }
}));

app.use(createArtworkProxyRouter());

// Create HTTP server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, verifyClient: ({ req }) => localRequest(req) });
botService.start(wss);
void pluginManager.loadAll();
const heartbeat=setInterval(()=>{ for(const ws of wss.clients){ const socket=ws as typeof ws & {isAlive?:boolean}; if(socket.isAlive===false){socket.terminate();continue;} socket.isAlive=false; socket.ping(); } },30000);
wss.on('connection',(ws)=>{ const socket=ws as typeof ws & {isAlive?:boolean}; socket.isAlive=true; ws.on('pong',()=>{socket.isAlive=true;}); });


// Official Spotify OAuth (PKCE) for Spotify Connect and the embedded web player.
app.get('/auth/spotify/login', async (_req,res,next)=>{
  try { res.redirect(302, await botService.getSpotifyService().createAuthorizationUrl()); } catch(error) { next(error); }
});
app.get('/auth/spotify/callback', async (req,res)=>{
  try {
    const code=typeof req.query.code==='string'?req.query.code:'';
    const state=typeof req.query.state==='string'?req.query.state:'';
    if(!code||!state) throw new Error('Spotify hat keinen gültigen Autorisierungscode geliefert.');
    await botService.getSpotifyService().handleCallback(code,state);
    res.type('html').send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Spotify verbunden</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#f4f4f5;display:grid;place-items:center;min-height:90vh;margin:0}.card{background:#18181b;border:1px solid #27272a;border-radius:1.25rem;padding:2.5rem;text-align:center;max-width:420px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)}h1{color:#1ed760;font-size:1.5rem;margin:0 0 0.75rem}.desc{color:#a1a1aa;font-size:0.95rem;line-height:1.5;margin-bottom:1.5rem}.btn{display:inline-block;padding:0.7rem 1.5rem;background:#1ed760;color:#000;font-weight:700;border-radius:0.75rem;text-decoration:none;transition:background 0.2s}.btn:hover{background:#1fdf64}.sub{margin-top:1.5rem;color:#71717a;font-size:0.85rem}</style></head><body><div class="card"><h1>Spotify verbunden! &#x2705;</h1><p class="desc">Die Spotify-Anbindung wurde erfolgreich eingerichtet. Du kannst diesen Tab jetzt schlie&szlig;en und zum Music Bot zur&uuml;ckkehren.</p><a class="btn" href="javascript:window.close()">Fenster schlie&szlig;en</a><p class="sub"><a style="color:#71717a" href="/?tab=spotify&spotify=connected">Oder im Browser &ouml;ffnen &rarr;</a></p></div><script>setTimeout(function(){try{window.close();}catch(e){}},3500);</script></body></html>`);
  } catch(error) {
    res.status(400).type('html').send(`<!doctype html><meta charset="utf-8"><title>Spotify Verbindung</title><body style="font-family:system-ui;background:#111;color:#eee;padding:2rem"><h1>Spotify-Verbindung fehlgeschlagen</h1><p>${String(error instanceof Error?error.message:error).replace(/[<>&]/g,'')}</p><p><a style="color:#1ed760" href="/">Zurück zum Bot</a></p></body>`);
  }
});
app.get('/spotify/player', (_req,res)=>{
  // Keep existing bookmarks working after removal of the old SDK tab.
  res.redirect(302,'/?tab=webPlayer');
});

const api = createApiRouter({ sessionToken, appVersion: APP_VERSION, overlayAssetsDir });
app.post('/api/desktop/tab', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/v1', api);
app.use('/api', api);
app.use('/api', (_req, _res, next) => next(new BotError('NOT_FOUND', 'API-Endpunkt nicht gefunden.', 404)));

// Direct OBS overlay HTML endpoint if requested as standalone

app.get('/overlay/standalone', (req,res)=>{ const query=req.url.includes('?')?req.url.slice(req.url.indexOf('?')):''; res.redirect(302,'/overlay'+query); });

// -------------------------------------------------------------
// Vite Middleware / SPA Static serving
// -------------------------------------------------------------

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/data/**',
            '**/desktop/**',
            '**/tests/**',
            '**/*.log',
            '**/*.json',
            '**/.secret-key',
            '**/dist/**',
            '**/graphify-out/**',
            '**/.cursor/**'
          ]
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use((req, res, next) => { if (/\.(cjs|map)$/.test(req.path)) { res.sendStatus(404); return; } next(); });
    app.use(express.static(distPath, { index: false, setHeaders: (res, file) => { if (file.endsWith('.cjs') || file.endsWith('.map')) res.statusCode = 404; } }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { const payload=errorPayload(error); if (payload.status >= 500) logger.log('error','BOT','API request failed',{error:error instanceof Error?error.message:String(error)}); res.status(payload.status).json(payload.body); });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Twitch YTM Bot] Server running on http://localhost:${PORT}`);
    console.log(`[OBS Overlay] OBS Browser Source URL: http://localhost:${PORT}/overlay`);
  });
}

start().catch(error => { console.error('Bot konnte nicht starten:', error.message); process.exit(1); });


let shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal}: Bot wird sauber beendet …`);
  try { botService.shutdown(); } catch (error) { console.warn('Shutdown-Warnung:', error); }
  try { clearInterval(heartbeat); flushScheduledWrites(); logger.flush(); } catch (error) { console.warn('Persistenz-Warnung:', error); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
