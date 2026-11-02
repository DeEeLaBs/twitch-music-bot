import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { getGreetingService, type GreetingService } from '../greetingService.ts';
import { parseGreetingMedia } from '../greetingMedia.ts';
import { botService } from '../botService.ts';
import { asyncRoute, validationError } from '../http.ts';
import { BotError } from '../errors.ts';

// This endpoint is available to token-authenticated OBS sources; administration still requires the local session.
export function createGreetingOutputRoutes(service?:GreetingService) {
 const router=Router();
 router.post('/greetings/output',(req,res)=>{
  const {token,overlayId,clientId}=req.body||{};
  if(typeof token!=='string'||!botService.overlayTokenMatches(token)||typeof overlayId!=='string'||typeof clientId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(clientId))throw new BotError('NOT_FOUND','Ausgabe nicht verfügbar.',404);
  let available=false;
  try {available=!!botService.overlayLibrary.get(overlayId).options.scene?.widgets.some(w=>w.type==='greeting'&&w.visible);}catch{}
  if(!available)throw new BotError('NOT_FOUND','Begrüßungs-Widget in diesem Overlay nicht verfügbar.',404);
  res.json((service||getGreetingService()).claim(overlayId,clientId,typeof req.body.doneId==='string'?req.body.doneId:undefined));
 });return router;
}
export function createGreetingRoutes(assetsDir:string,service?:GreetingService) {
 const router=Router();
 router.get('/greetings',(_req,res)=>res.json((service||getGreetingService()).snapshot()));
 router.get('/greetings/resolve',asyncRoute(async(req,res)=>{
  try{res.json(await botService.resolveGreetingUser(typeof req.query.login==='string'?req.query.login:''));}
  catch(error){throw validationError(error,'Twitch-Person nicht gefunden.');}
 }));
 router.post('/greetings',(req,res)=>{
  const raw=req.body;
  if(raw?.outputOverlayId) {
   try{botService.overlayLibrary.get(raw.outputOverlayId);}catch{throw new BotError('VALIDATION','Ausgabe-Overlay nicht gefunden.',400);}
  }
  try{res.json((service||getGreetingService()).configure(raw));}catch(error){throw validationError(error,'Begrüßungen konnten nicht gespeichert werden.');}
 });
 router.post('/greetings/media',asyncRoute(async(req,res)=>{
  let media:ReturnType<typeof parseGreetingMedia>;
  try{media=parseGreetingMedia(req.body?.dataUrl,req.body?.kind);}catch(error){throw validationError(error,'Ungültige Mediendatei.');}
  const filename=`greeting-${crypto.randomUUID()}.${media.extension}`;
  try{await fs.mkdir(assetsDir,{recursive:true});await fs.writeFile(path.join(assetsDir,filename),media.bytes,{flag:'wx'});}
  catch{throw new BotError('INTERNAL','Datei konnte nicht gespeichert werden.',500);}
  res.json({url:`/overlay-assets/${filename}`});
 }));return router;
}
