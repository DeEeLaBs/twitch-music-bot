import fs from 'node:fs';
import path from 'node:path';

export function writeJson(file: string, data: unknown, options?: { compact?: boolean; preserveBackup?: boolean; strictAtomic?: boolean }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2, 6)}.tmp`;
  if (!options?.preserveBackup && fs.existsSync(file)) {
    try { fs.copyFileSync(file, file + '.backup'); } catch { /* best effort */ }
  }
  const json = options?.compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  fs.writeFileSync(temporary, json, { mode: 0o600 });
  try {
    fs.renameSync(temporary, file);
  } catch (err: any) {
    if (!options?.strictAtomic && (err?.code === 'EPERM' || err?.code === 'EBUSY')) {
      try {
        fs.copyFileSync(temporary, file);
        fs.unlinkSync(temporary);
      } catch {
        fs.renameSync(temporary, file);
      }
    } else {
      try { fs.unlinkSync(temporary); } catch {}
      throw err;
    }
  }
}

const pending = new Map<string, { timer: NodeJS.Timeout; data: unknown; compact?: boolean }>();
export function scheduleJsonWrite(file: string, data: unknown, delayMs = 75, options?: { compact?: boolean }) {
  const old = pending.get(file);
  if (old) clearTimeout(old.timer);
  const timer = setTimeout(() => {
    const latest = pending.get(file);
    if (!latest) return;
    pending.delete(file);
    try { writeJson(file, latest.data, { compact: latest.compact }); }
    catch (error) { console.error(`[AtomicStore] Schreiben fehlgeschlagen: ${file}`, error); }
  }, delayMs);
  pending.set(file, { timer, data, compact: options?.compact });
}

export function flushScheduledWrites() {
  for (const [file, item] of pending) {
    clearTimeout(item.timer);
    writeJson(file, item.data, { compact: item.compact });
    pending.delete(file);
  }
}
