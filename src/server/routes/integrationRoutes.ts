import { nectarBridge } from '../nectarBridge.ts';
import { Router } from 'express';
import path from 'path';
import fs from 'node:fs';
import { botService } from '../botService.ts';
import { asyncRoute, messageFromUnknown } from '../http.ts';
import { BotError } from '../errors.ts';

function channelPointsError(error: unknown): BotError {
  if (error instanceof BotError) return error;
  const message = messageFromUnknown(error, 'Kanalpunkte-Belohnungen konnten nicht geladen werden.');
  const authFailure = /token|oauth|autoris|scopes|berechtig|broadcaster-konto/i.test(message);
  return new BotError(authFailure ? 'AUTH_REQUIRED' : 'UPSTREAM_UNAVAILABLE', message, authFailure ? 401 : 502);
}

export function createIntegrationRoutes(){
  const router=Router();
  router.post('/twitch/oauth/start',asyncRoute(async(req,res)=>{
    // An empty Client ID means "use the app that ships with the bot" (or the one already saved).
    const clientId=(typeof req.body?.clientId==='string'?req.body.clientId.trim():'')||botService.getTwitchClientId();
    const clientSecret=typeof req.body?.clientSecret==='string'?req.body.clientSecret.trim():undefined;
    if (!clientId) throw new BotError('VALIDATION','Für diese Version ist keine Twitch-Anwendung hinterlegt. Bitte unter „Erweitert“ die Client-ID deiner eigenen Twitch-Anwendung eingeben.',400);
    if (!/^[a-z0-9]{10,64}$/i.test(clientId)) throw new BotError('VALIDATION','Die Twitch Client-ID ist ungültig.',400);
    try {
      res.json(await botService.startTwitchOAuth(clientId, clientSecret));
    } catch (error) {
      if (error instanceof BotError) throw error;
      throw new BotError('UPSTREAM_UNAVAILABLE',messageFromUnknown(error,'Twitch konnte die Anmeldung nicht starten.'),502);
    }
  }));
  router.get('/twitch/oauth/status',(_req,res)=>res.json(botService.getTwitchOAuthStatus()));
  router.post('/twitch/oauth/resume',asyncRoute(async(req,res)=>{
    const secret = typeof req.body?.clientSecret === 'string' ? req.body.clientSecret.trim() : undefined;
    res.json(await botService.resumeTwitchOAuth(secret));
  }));
  router.post('/twitch/oauth/poll',asyncRoute(async(_req,res)=>res.json(await botService.pollTwitchOAuth())));
  router.post('/twitch/channel-point-rewards/create',asyncRoute(async(req,res)=>{try { res.json(await botService.createChannelPointReward(req.body?.title,req.body?.cost)); } catch(error) { throw channelPointsError(error); }}));
  router.get('/twitch/channel-point-rewards/validate',asyncRoute(async(_req,res)=>{try { res.json(await botService.validateChannelPointReward()); } catch(error) { throw channelPointsError(error); }}));
  router.get('/twitch/channel-point-rewards',asyncRoute(async(_req,res)=>{try { res.json(await botService.getTwitchChannelPointRewards()); } catch(error) { throw channelPointsError(error); }}));
  router.post('/ytm/pair/start',asyncRoute(async(_req,res)=>{
    const result=await botService.startPairing();
    if(!result) throw new BotError('COMPANION_UNAVAILABLE','Konnte keine Verbindung zum Begleitserver herstellen.',503);
    res.json(result);
  }));
  router.post('/ytm/pair/cancel',(_req,res)=>{botService.cancelPairing();res.json({success:true});});
  router.post('/ytm/pair/reset',(_req,res)=>{botService.resetYtmPairingAndToken();res.json({success:true,message:'Token und Kopplungsstatus erfolgreich zurückgesetzt.'});});
  // Connection diagnostics intentionally return a diagnostic object even when the test itself fails,
  // because the setup wizard consumes these details instead of generic HTTP errors.
  router.all(['/ytm/test','/ytm/test-connection'],asyncRoute(async(_req,res)=>{
    try { res.json(await botService.testYtmConnection()); }
    catch(error){ res.json({reachable:false,resolvedUrl:'http://127.0.0.1:9863',authStatus:'none',details:`Testfehler: ${messageFromUnknown(error,'Serverfehler')}`}); }
  }));
  for (const [route, file, name] of [
    ['start-vbs', 'Start-Bot.vbs', 'Start-Bot.vbs'],
    ['stop-bat', 'Stop-Bot.bat', 'Stop-Bot.bat'],
    ['start-bat', 'Start-Bot.bat', 'Start-Bot.bat'],
    ['autostart-bat', 'Autostart-Einrichten.bat', 'Autostart-Einrichten.bat'],
    ['autostart-remove-bat', 'Autostart-Entfernen.bat', 'Autostart-Entfernen.bat']
  ] as const) {
    router.get(`/scripts/${route}`, (_req, res) => {
      const filePath = path.join(process.cwd(), file);
      res.download(filePath, name, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ success: false, error: 'Skript-Datei nicht gefunden.' });
        }
      });
    });
  }
    // NectarLink Integration Bridge
  router.post('/nectar/state', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BotError('VALIDATION', 'Ungültiger Wiedergabestatus.', 400);
    for (const key of ['title', 'artist', 'album', 'albumArtUrl', 'url', 'playerApp']) {
      if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > (key === 'albumArtUrl' ? 2_000_000 : 4096))) throw new BotError('VALIDATION', 'Ungültiges Feld: ' + key, 400);
    }
    for (const key of ['progressSeconds', 'durationSeconds']) {
      if (body[key] !== undefined && (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < 0)) throw new BotError('VALIDATION', 'Ungültiges Feld: ' + key, 400);
    }
    if (body.isPlaying !== undefined && typeof body.isPlaying !== 'boolean') throw new BotError('VALIDATION', 'Ungültiger Wiedergabestatus.', 400);
    const updated = nectarBridge.updateState(req.body || {});
    res.json({ success: true, state: updated });
  });
  router.get('/nectar/state', (_req, res) => {
    res.json({ success: true, connected: nectarBridge.getIsConnected(), state: nectarBridge.getState() });
  });
  router.post('/nectar/command', asyncRoute(async (req, res) => {
    const action = req.body?.action;
    if (!['play', 'pause', 'play_pause', 'next', 'previous', 'volume'].includes(action)) throw new BotError('VALIDATION', 'Ungültige Aktion.', 400);
    const ok = await nectarBridge.sendCommand(action, req.body?.volume);
    res.json({ success: ok });
  }));
  router.get('/nectar/cover', (_req, res) => {
    const artDir = path.join(process.env.LOCALAPPDATA || '', 'Nectarlink', 'cache', 'art');
    if (!fs.existsSync(artDir)) {
      res.status(404).send('Not found');
      return;
    }
    try {
      const files = fs.readdirSync(artDir)
        .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
        .map(f => {
          const full = path.join(artDir, f);
          return { full, time: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.time - a.time);

      if (!files.length) {
        res.status(404).send('No artwork cached');
        return;
      }

      const newest = files[0].full;
      res.setHeader('Content-Type', newest.endsWith('.png') ? 'image/png' : 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.sendFile(newest);
    } catch {
      res.status(500).send('Error reading cover');
    }
  });
  router.get('/nectar/poll-commands', (_req, res) => {
    res.json({ commands: nectarBridge.popPendingCommands() });
  });

  return router;
}
