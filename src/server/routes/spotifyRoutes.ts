import { Router } from 'express';
import { botService } from '../botService.ts';
import { asyncRoute } from '../http.ts';
import { BotError } from '../errors.ts';

export function createSpotifyRoutes() {
  const router = Router();
  router.get('/spotify/status', asyncRoute(async (_req,res)=>{
    res.json({ success:true, ...botService.getSpotifyService().getStatus() });
  }));
  router.get('/spotify/devices', asyncRoute(async (_req,res)=>{
    res.json({ success:true, devices: await botService.getSpotifyService().devices() });
  }));
  router.get('/spotify/token', asyncRoute(async (_req,res)=>{
    const accessToken = await botService.getSpotifyService().getAccessToken();
    res.json({ success:true, accessToken });
  }));
  router.post('/spotify/device', asyncRoute(async (req,res)=>{
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    if (!deviceId) throw new BotError('VALIDATION','Spotify Device ID fehlt.',400);
    botService.setSpotifyPreferredDevice(deviceId);
    if (req.body?.transfer !== false) await botService.getSpotifyService().transferPlayback(deviceId, false);
    res.json({ success:true, status:botService.getSpotifyService().getStatus() });
  }));
  router.post('/spotify/disconnect', asyncRoute(async (_req,res)=>{
    botService.getSpotifyService().disconnect();
    res.json({ success:true });
  }));
  return router;
}
