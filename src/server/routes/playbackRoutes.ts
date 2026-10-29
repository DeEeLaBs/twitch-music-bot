import { Router } from 'express';
import { botService } from '../botService.ts';
import { textField } from '../validation.ts';
import { BotError } from '../errors.ts';
import { asyncRoute, validationError } from '../http.ts';
import type { BadgeType } from '../../types.ts';

const allowedBadges: BadgeType[] = ['viewer','broadcaster','moderator','subscriber','vip'];

export function createPlaybackRoutes() {
  const router=Router();

  router.post('/song/request', asyncRoute(async(req,res)=>{
    const {query,username,badge}=req.body;
    let safeQuery: string;
    let safeUsername = 'Streamer';
    try {
      safeQuery = textField(query,'Suche');
      if(username!==undefined) safeUsername = textField(username,'Benutzername',40);
    } catch (error) {
      throw validationError(error, 'Ungültiger Songrequest.');
    }
    const safeBadge: BadgeType = badge === undefined ? 'broadcaster' : badge;
    if(!allowedBadges.includes(safeBadge)) throw new BotError('VALIDATION','Ungültige Rolle.',400);
    const result=await botService.requestSongManually(safeQuery,safeUsername,safeBadge);
    res.json(result);
  }));

  router.post('/playback/play-pause', asyncRoute(async(_req,res)=>{ const success=await botService.getQueueManager().playPause(); res.json({success,error:botService.getQueueManager().getPlaybackState().error}); }));
  router.post('/playback/skip', asyncRoute(async(req,res)=>{
    const manager = botService.getQueueManager();
    const result = await manager.skipCurrent(req.body?.user || 'Streamer');
    const spotify = botService.getFullState().config.playbackProvider === 'spotify';
    res.json({ ...result,
      isConnected: spotify ? botService.getSpotifyService().isConnected() : botService.getYtmCompanion().getIsConnected(),
      error: result.success ? undefined : manager.getPlaybackState().error || (spotify ? 'Spotify Skip fehlgeschlagen.' : botService.getYtmCompanion().getLastCommandError())
    });
  }));
  router.post('/playback/previous', asyncRoute(async(_req,res)=>{ const success=await botService.getQueueManager().previousTrack(); res.json({success,error:botService.getQueueManager().getPlaybackState().error}); }));
  router.post('/playback/volume', asyncRoute(async(req,res)=>{
    const volume=req.body?.volume;
    if(typeof volume!=='number'||!Number.isFinite(volume)||volume<0||volume>100) throw new BotError('VALIDATION','Lautstärke muss zwischen 0 und 100 liegen.',400);
    const success=await botService.getQueueManager().setVolume(volume);
    res.json({success,error:botService.getQueueManager().getPlaybackState().error});
  }));
  router.post('/playback/clear-error', asyncRoute(async(_req,res)=>{
    botService.getQueueManager().clearPlaybackError();
    res.json({success:true});
  }));
  return router;
}
