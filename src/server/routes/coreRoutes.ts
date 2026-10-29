import { Router } from 'express';
import path from 'path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { botService } from '../botService.ts';
import { getStreamStats, setStreamGoal, setStreamTimer } from '../alertService.ts';
import { validateConfig } from '../validation.ts';
import { BotError } from '../errors.ts';
import { asyncRoute, validationError } from '../http.ts';

export function createCoreRoutes(sessionToken: string, appVersion: string, overlayAssetsDir: string) {
  const router = Router();
  router.get('/session', (_req,res)=>res.json({token:sessionToken}));
  router.get('/health', (_req,res)=>res.json({ app:'twitch-music-bot', status:'ok', version:appVersion, timestamp:Date.now() }));
  router.get('/state', (_req,res)=>res.json(botService.getFullState()));
  router.get('/streamer/avatar', asyncRoute(async (_req,res)=>{
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ url: await botService.getStreamerAvatar() });
  }));
  router.get('/diagnostics', (_req,res)=>res.json({ success:true, ...botService.getDiagnostics() }));
  router.get('/diagnostics/export', (_req,res)=>{ const payload={app:'twitch-music-bot',version:appVersion,generatedAt:new Date().toISOString(),diagnostics:botService.getDiagnostics()}; res.setHeader('Content-Disposition','attachment; filename="bot-diagnostics.json"'); res.type('application/json').send(JSON.stringify(payload,null,2)); });

  router.post('/config', asyncRoute(async (req,res)=>{
    try {
      botService.updateConfig(validateConfig(req.body));
    } catch (error) {
      throw validationError(error, 'Ungültige Konfiguration.');
    }
    res.json({success:true,state:botService.getFullState()});
  }));

  router.post('/overlay/assets', asyncRoute(async (req,res)=>{
    const requested=req.body?.kind;
    const kind=requested==='logo'?'logo':requested==='background'?'background':requested==='alert-sound'?'alert-sound':requested==='alert-video'?'alert-video':null;
    const dataUrl=typeof req.body?.dataUrl==='string'?req.body.dataUrl:'';
    if(!kind) throw new BotError('VALIDATION','Ungültiger Asset-Typ.',400);
    const match=kind==='alert-sound'
      ? /^data:(audio\/(?:mpeg|mp3|wav|x-wav|wave|vnd\.wave|ogg|webm|mp4|x-m4a|m4a));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
      : kind==='alert-video'
        ? /^data:(video\/(?:mp4|webm));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
        : /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if(!match) throw new BotError('VALIDATION', kind==='alert-sound' ? 'Ungültiges Tonformat.' : kind==='alert-video' ? 'Nur MP4 oder WebM.' : 'Ungültiges Bildformat.', 400);
    const buffer=Buffer.from(match[2],'base64');
    const maxBytes=kind==='alert-video'?8*1024*1024:12*1024*1024;
    if(!buffer.length||buffer.length>maxBytes) throw new BotError('VALIDATION', kind==='alert-video' ? 'Das Video darf maximal 8 MB groß sein.' : 'Die Datei darf maximal 12 MB groß sein.', 400);
    const audioExtension: Record<string, string>={ 'audio/mpeg':'mp3', 'audio/mp3':'mp3', 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/wave':'wav', 'audio/vnd.wave':'wav', 'audio/ogg':'ogg', 'audio/webm':'webm', 'audio/mp4':'m4a', 'audio/x-m4a':'m4a', 'audio/m4a':'m4a' };
    const videoExtension: Record<string, string>={ 'video/mp4':'mp4', 'video/webm':'webm' };
    const extension=kind==='alert-sound' ? audioExtension[match[1]] : kind==='alert-video' ? videoExtension[match[1]] : match[1]==='image/jpeg'?'jpg':match[1].slice('image/'.length);
    const filename=`${kind}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extension}`;
    try {
      await fs.writeFile(path.join(overlayAssetsDir,filename),buffer,{flag:'wx'});
    } catch {
      throw new BotError('INTERNAL','Bild konnte nicht gespeichert werden.',500);
    }
    res.json({success:true,url:`/overlay-assets/${filename}`});
  }));

  router.get('/overlay/token', (_req, res) => {
    res.json({ token: botService.getOverlayToken() });
  });

  router.get('/overlay/access', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!botService.overlayTokenMatches(token)) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json({ ok: true, options: botService.getActiveOverlay() });
  });

  router.get('/overlay/stats', (_req, res) => {
    res.json({ stats: getStreamStats() });
  });

  router.post('/overlay/goals', asyncRoute(async (req, res) => {
    const kind = req.body?.kind === 'sub' ? 'sub' : req.body?.kind === 'follower' ? 'follower' : null;
    if (!kind) throw new BotError('VALIDATION', 'Ungültiges Ziel.', 400);
    res.json({ stats: setStreamGoal(kind, Number(req.body?.target)) });
  }));

  router.post('/overlay/timer', asyncRoute(async (req, res) => {
    res.json({ stats: setStreamTimer(Number(req.body?.seconds) || 0) });
  }));

  router.get('/overlay/badges', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ sets: await botService.getGlobalBadges() });
  }));

  router.get('/overlay/active', (_req, res) => {
    res.json({ success: true, options: botService.getActiveOverlay() });
  });

  router.post('/overlay/active', asyncRoute(async (req, res) => {
    const raw = req.body?.options ?? req.body;
    if (!raw || typeof raw !== 'object') throw new BotError('VALIDATION', 'Ungültige Overlay-Optionen.', 400);
    const updated = botService.setActiveOverlay(raw);
    res.json({ success: true, options: updated });
  }));

  return router;
}
