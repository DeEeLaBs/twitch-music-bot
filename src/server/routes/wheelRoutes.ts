import {Router} from 'express';
import {getWheelService,type WheelService} from '../wheelService.ts';
import {botService} from '../botService.ts';
import {validationError} from '../http.ts';
import {BotError} from '../errors.ts';
export function createWheelOutputRoutes(service?:WheelService){const router=Router();router.get('/wheel/output',(req,res)=>{
 const {token,overlayId}=req.query;
 if(typeof token!=='string'||!botService.overlayTokenMatches(token)||typeof overlayId!=='string')throw new BotError('NOT_FOUND','Glücksrad nicht verfügbar.',404);
 let valid=false;try{valid=!!botService.overlayLibrary.get(overlayId).options.scene?.widgets.some(w=>w.type==='wheel'&&w.visible);}catch{}
 if(!valid)throw new BotError('NOT_FOUND','Glücksrad-Widget nicht verfügbar.',404);
 res.json((service||getWheelService()).snapshot());
});return router;}
export function createWheelRoutes(injected?:WheelService){const router=Router();router.get('/wheel',(_req,res)=>res.json((injected||getWheelService()).snapshot()));
 router.post('/wheel/:action',(req,res)=>{try{const service=injected||getWheelService();switch(req.params.action){case 'configure':res.json(service.configure(req.body?.fields));break;case 'show':res.json(service.show());break;case 'spin':res.json(service.spin(req.body?.operationId));break;case 'hide':res.json(service.hide());break;default:throw new Error('Unbekannte Glücksrad-Aktion.');}}catch(error){throw validationError(error,'Glücksrad-Aktion fehlgeschlagen.');}});return router;}
