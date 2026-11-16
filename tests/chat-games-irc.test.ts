import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TwitchBot} from '../src/server/twitchBot.ts';
import {GameService} from '../src/server/gameService.ts';
import {GameChat} from '../src/server/gameChat.ts';
test('real IRC parser routes aliases with trusted roles and rejects channel-point and shared commands',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'games-irc-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const games=new GameService(path.join(dir,'games.json'));const bot=Object.create(TwitchBot.prototype) as any;
 Object.assign(bot,{config:{twitchChannel:'channel',twitchBotUsername:'bot',commandPermissions:{game:['viewer','moderator','broadcaster']}},gameChat:new GameChat(games),logCallbacks:new Set(),roomId:'99'});
 const line=(message:string,badge:string,extra='')=>`@id=${crypto.randomUUID()};user-id=123;display-name=Viewer;badges=${badge};room-id=99;tmi-sent-ts=${Date.now()}${extra} :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :${message}`;
 await bot.parsePrivMsg(line('!spiel start quiz',''));assert.equal(games.output().round,null);
 await bot.parsePrivMsg(line('!spiel start quiz','moderator/1',';custom-reward-id=reward'));assert.equal(games.output().round,null);
 await bot.parsePrivMsg(line('!spiel start quiz','moderator/1',';source-room-id=88'));assert.equal(games.output().round,null);
 await bot.parsePrivMsg(line('!spiel start quiz','moderator/1').replace('#channel :','#other :'));assert.equal(games.output().round,null);
 await bot.parsePrivMsg(line('!spiel start quiz','moderator/1'));assert.equal(games.output().round?.kind,'quiz');
 await bot.parsePrivMsg(line('!antwort 1',''));await bot.parsePrivMsg(line('!game finish','moderator/1'));assert.equal(games.points('123'),10);
 await bot.parsePrivMsg(line('!game cancel','moderator/1'));
 for(const [command,kind] of [['!quiz','quiz'],['!zahlenraten','number'],['!wortraten','word'],['!abenteuer','adventure']]){
  await bot.parsePrivMsg(line(command,''));assert.equal(games.output().round,null);
  await bot.parsePrivMsg(line(command,'moderator/1'));assert.equal(games.output().round?.kind,kind);
  await bot.parsePrivMsg(line('!game cancel','moderator/1'));
 }
});
