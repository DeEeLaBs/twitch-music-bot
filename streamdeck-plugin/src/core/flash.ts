/** Remembers which keys are in their short "it worked" flash. Pure bookkeeping; drawing happens elsewhere. */
export class FlashTracker {
  private readonly until = new Map<string, number>();
  private readonly durationMs: number;

  constructor(durationMs = 220) { this.durationMs = durationMs; }

  get duration(): number { return this.durationMs; }

  /** Starts (or restarts) the flash of a key. */
  trigger(key: string, now: number): void { this.until.set(key, now + this.durationMs); }

  isActive(key: string, now: number): boolean {
    const end = this.until.get(key);
    if (end === undefined) return false;
    if (now >= end) { this.until.delete(key); return false; }
    return true;
  }

  clear(key: string): void { this.until.delete(key); }
}
