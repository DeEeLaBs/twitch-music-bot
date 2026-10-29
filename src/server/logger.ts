import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug'|'info'|'warn'|'error';
const rank: Record<LogLevel, number> = { debug:0, info:1, warn:2, error:3 };

export class StructuredLogger {
  private level: LogLevel;
  private maxBytes: number;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private get file() { return path.join(process.cwd(),'data','bot.log'); }

  constructor(level: LogLevel='info', maxBytes=5*1024*1024) { this.level=level; this.maxBytes=maxBytes; }
  setLevel(level: LogLevel) { this.level = level; }

  log(level: LogLevel, category: string, message: string, meta?: unknown) {
    if (rank[level] < rank[this.level]) return;
    this.buffer.push(JSON.stringify({ts:new Date().toISOString(),level,category,message,meta})+'\n');
    // Twitch chat can be busy. Batch file writes so logging does not perform a blocking
    // stat+append syscall for every single IRC message.
    if (this.buffer.length >= 50) this.flush();
    else if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (!this.buffer.length) return;
    const payload = this.buffer.join('');
    this.buffer = [];
    try {
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      const incomingBytes = Buffer.byteLength(payload);
      const existingBytes = fs.existsSync(this.file) ? fs.statSync(this.file).size : 0;
      if (existingBytes > 0 && existingBytes + incomingBytes > this.maxBytes) {
        const old=this.file+'.1';
        try { fs.rmSync(old,{force:true}); } catch { /* best effort */ }
        fs.renameSync(this.file,old);
      }
      fs.appendFileSync(this.file,payload,{mode:0o600});
    } catch {
      // Logging must never crash the bot. If a batch cannot be written it is dropped;
      // keeping it forever would otherwise grow memory without bound.
    }
  }
}

export const logger = new StructuredLogger();
