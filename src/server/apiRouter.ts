import { Router } from 'express';
import { createCoreRoutes } from './routes/coreRoutes.ts';
import { createPlaybackRoutes } from './routes/playbackRoutes.ts';
import { createQueueRoutes } from './routes/queueRoutes.ts';
import { createIntegrationRoutes } from './routes/integrationRoutes.ts';
import { createSpotifyRoutes } from './routes/spotifyRoutes.ts';
import { BotError } from './errors.ts';

export function createApiRouter(options:{sessionToken:string;appVersion:string;overlayAssetsDir:string}) {
  const api=Router();
  let requestsInFlight=0;
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.use('/song/request',(_req,res,next)=>{
    if(requestsInFlight>=4){ next(new BotError('RATE_LIMITED','Zu viele Suchanfragen. Bitte warten.',429)); return; }
    requestsInFlight++;
    let released=false;
    const release=()=>{if(!released){released=true;requestsInFlight=Math.max(0,requestsInFlight-1);}};
    res.once('finish',release);
    res.once('close',release);
    next();
  });

  api.use((req,_res,next)=>{
    if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    if(req.headers['x-bot-session']!==options.sessionToken){ next(new BotError('AUTH_REQUIRED','Ungültige lokale Sitzung. Oberfläche neu laden.',403)); return; }
    next();
  });

  api.use(createCoreRoutes(options.sessionToken,options.appVersion,options.overlayAssetsDir));
  api.use(createIntegrationRoutes());
  api.use(createSpotifyRoutes());
  api.use(createPlaybackRoutes());
  api.use(createQueueRoutes());
  return api;
}
