import { Router } from 'express';
import path from 'path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { botService } from '../botService.ts';
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
    const kind=req.body?.kind==='logo'?'logo':req.body?.kind==='background'?'background':null;
    const dataUrl=typeof req.body?.dataUrl==='string'?req.body.dataUrl:'';
    if(!kind) throw new BotError('VALIDATION','Ungültiger Asset-Typ.',400);
    const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if(!match) throw new BotError('VALIDATION','Ungültiges Bildformat.',400);
    const buffer=Buffer.from(match[2],'base64');
    if(!buffer.length||buffer.length>1024*1024) throw new BotError('VALIDATION','Das Bild darf maximal 1 MB groß sein.',400);
    const extension=match[1]==='image/jpeg'?'jpg':match[1].slice('image/'.length);
    const filename=`${kind}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extension}`;
    try {
      await fs.writeFile(path.join(overlayAssetsDir,filename),buffer,{flag:'wx'});
    } catch {
      throw new BotError('INTERNAL','Bild konnte nicht gespeichert werden.',500);
    }
    res.json({success:true,url:`/overlay-assets/${filename}`});
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
