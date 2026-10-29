import { Router } from 'express';
import { botService } from '../botService.ts';
import { textField } from '../validation.ts';
import { BotError } from '../errors.ts';
import { asyncRoute, validationError } from '../http.ts';
import type { BadgeType } from '../../types.ts';

const allowedBadges: BadgeType[] = ['viewer','broadcaster','moderator','subscriber','vip'];

export function createQueueRoutes(){
  const router=Router();
  router.post('/queue/move',(req,res)=>{
    try { res.json({success:botService.getQueueManager().moveTrack(textField(req.body?.trackId,'Song-ID',200),Number(req.body?.newIndex))}); }
    catch(error){ throw validationError(error,'Ungültige Queue-Änderung.'); }
  });
  router.post('/queue/requester/remove',(req,res)=>{try{const username=textField(req.body?.username,'Benutzername',40);res.json({success:true,count:botService.getQueueManager().removeRequester(username)});}catch(error){throw validationError(error,'Ungültiger Benutzername.');}});
  router.post('/queue/requester/block',(req,res)=>{try{const username=textField(req.body?.username,'Benutzername',40);res.json({success:true,blockedRequesters:botService.setRequesterBlocked(username,req.body?.blocked!==false)});}catch(error){throw validationError(error,'Ungültiger Benutzername.');}});
  router.post('/queue/veto',(req,res)=>{try{const removed=botService.getQueueManager().vetoTrack(textField(req.body?.trackId,'Song-ID',200));res.json({success:Boolean(removed),removed});}catch(error){throw validationError(error,'Ungültige Song-ID.');}});
  router.post('/queue/clear',(_req,res)=>res.json({success:true,count:botService.getQueueManager().clearQueue()}));
  router.post('/queue/vote-skip',asyncRoute(async(req,res)=>{try{res.json(await botService.getQueueManager().castVoteSkip(textField(req.body?.username||'viewer','Benutzername',40)));}catch(error){throw validationError(error,'Ungültiger Benutzername.');}}));
  router.post('/queue/start',asyncRoute(async(_req,res)=>{const track=await botService.getQueueManager().playNext();res.json({success:Boolean(track),error:botService.getQueueManager().getPlaybackState().error});}));
  router.post('/blacklist',(req,res)=>{
    const {term,type,addedBy}=req.body;
    if(!term) throw new BotError('VALIDATION','Filter fehlt.',400);
    if(!['keyword','artist','channel'].includes(type||'keyword')) throw new BotError('VALIDATION','Ungültiger Filtertyp.',400);
    try {
      const safeTerm=textField(term,'Filter',100);
      const safeAddedBy=typeof addedBy==='string'&&addedBy.trim()?textField(addedBy,'Benutzername',40):'dashboard';
      res.json({success:true,rule:botService.getQueueManager().addBlacklistRule(safeTerm,safeAddedBy,type||'keyword')});
    } catch(error){ throw validationError(error,'Ungültiger Filter.'); }
  });
  router.delete('/blacklist/:id',(req,res)=>res.json({success:botService.getQueueManager().removeBlacklistRule(req.params.id)}));
  router.post('/simulate/chat',(req,res)=>{
    const {username,message,badge}=req.body;
    if(!message) throw new BotError('VALIDATION','Nachricht fehlt.',400);
    if(badge!==undefined&&!allowedBadges.includes(badge as BadgeType)) throw new BotError('VALIDATION','Ungültige Rolle.',400);
    try {
      const safeMessage=textField(message,'Nachricht');
      const safeUsername=username?textField(username,'Benutzername',40):'Viewer';
      botService.getTwitchBot().simulateMessage(safeUsername,safeMessage,(badge||'viewer') as BadgeType);
    } catch(error){ throw validationError(error,'Ungültige Chat-Simulation.'); }
    res.json({success:true});
  });
  router.get('/stream-playlist', (_req, res) => {
    res.json({ success: true, items: botService.getStreamPlaylistService().getItems() });
  });
  router.delete('/stream-playlist/:id', (req, res) => {
    const success = botService.getStreamPlaylistService().removeTrack(req.params.id);
    res.status(success ? 200 : 404).json({ success });
  });
  return router;
}
