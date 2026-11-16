import {Router} from 'express';
import {getGameService,type GameService} from '../gameService.ts';
import {botService} from '../botService.ts';
import {BotError} from '../errors.ts';
import {validationError} from '../http.ts';
export function createGameOutputRoutes(injected?:GameService){
 const router=Router();router.get('/games/output',(req,res)=>{
  const {token,overlayId}=req.query;if(typeof token!=='string'||!botService.overlayTokenMatches(token)||typeof overlayId!=='string')throw new BotError('NOT_FOUND','Spielausgabe nicht verfügbar.',404);
  let valid=false;try{valid=!!botService.overlayLibrary.get(overlayId).options.scene?.widgets.some(w=>w.type==='games'&&w.visible);}catch{}
  if(!valid)throw new BotError('NOT_FOUND','Chat-Spiele-Widget nicht verfügbar.',404);
  res.json((injected||getGameService()).output());
 });return router;
}
export function createGameRoutes(injected?:GameService){
 const router=Router();
 // Settings contain solutions: even reads require the existing dashboard session.
 router.post('/games/:action',(req,res)=>{try{
  const service=injected||getGameService();switch(req.params.action){
   case 'read':res.json(service.snapshot());break;
   case 'configure':res.json(service.configure(req.body?.settings));break;
   case 'start':res.json(service.start(req.body?.kind,req.body?.startToken,req.body?.contentId));break;
   case 'control':{
    const current=service.output().round;
    if(current?.kind==='adventure'&&['finish','choose'].includes(req.body?.action)&&req.body?.step!==current.steps)throw Error('Diese Abenteuer-Entscheidung ist bereits abgeschlossen. Status aktualisieren.');
    res.json(service.control(req.body?.action,req.body?.roundId,req.body?.choice));break;
   }
   default:throw Error('Unbekannte Spielaktion.');
  }
 }catch(error){throw validationError(error,'Spielaktion fehlgeschlagen.');}});return router;
}
