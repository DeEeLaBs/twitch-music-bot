import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from './logger.ts';
export interface BotPlugin { name: string; version?: string; setup?(ctx:{log:(msg:string)=>void}): void|Promise<void>; }
export class PluginManager {
  private loaded: string[]=[]; private errors: string[]=[];
  async loadAll() {
    const dir=path.join(process.cwd(),'plugins'); fs.mkdirSync(dir,{recursive:true});
    for (const file of fs.readdirSync(dir).filter(f=>/\.(mjs|js)$/.test(f))) {
      try { const mod=await import(pathToFileURL(path.join(dir,file)).href); const plugin=(mod.default||mod) as BotPlugin; if (!plugin?.name) throw new Error('Plugin name missing'); await plugin.setup?.({log:(m)=>logger.log('info','BOT',`Plugin ${plugin.name}: ${m}`)}); this.loaded.push(`${plugin.name}${plugin.version?`@${plugin.version}`:''}`); }
      catch(e){const message=`${file}: ${e instanceof Error?e.message:String(e)}`; this.errors.push(message); logger.log('error','BOT','Plugin konnte nicht geladen werden',{message});}
    }
  }
  diagnostics(){return {loaded:[...this.loaded],errors:[...this.errors]};}
}
export const pluginManager=new PluginManager();
