import { Router } from 'express';
import path from 'path';
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
    const clientId=typeof req.body?.clientId==='string'?req.body.clientId.trim():'';
    const clientSecret=typeof req.body?.clientSecret==='string'?req.body.clientSecret.trim():undefined;
    if (!clientId) throw new BotError('VALIDATION','Bitte zuerst die Client-ID deiner Twitch-Anwendung eingeben.',400);
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
  return router;
}
