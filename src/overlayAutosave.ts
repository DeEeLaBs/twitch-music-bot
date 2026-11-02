export interface AutosaveStatus {
  state: 'saved' | 'pending' | 'saving' | 'error';
  dirty: boolean;
  error?: string;
}

/** Coalesces rapid edits and keeps at most one write in flight. */
export class OverlayAutosave<T> {
  private draft: T;
  private encoded: string;
  private saved: string;
  private active = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private persist: (draft: T) => Promise<void>;
  private notify: (status: AutosaveStatus) => void;
  private wait: number;

  constructor(initial: T, persist: (draft: T) => Promise<void>, notify: (status: AutosaveStatus) => void, wait = 150) {
    this.draft = structuredClone(initial);
    this.encoded = this.saved = JSON.stringify(initial);
    this.persist = persist;
    this.notify = notify;
    this.wait = wait;
  }

  get dirty() { return this.encoded !== this.saved; }
  start() { this.active = true; }
  stop() {
    this.active = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  update(draft: T) {
    const encoded = JSON.stringify(draft);
    if (encoded === this.encoded) return;
    this.draft = structuredClone(draft);
    this.encoded = encoded;
    if (!this.active) return;
    this.notify({state: this.running ? 'saving' : this.dirty ? 'pending' : 'saved', dirty: this.dirty});
    if (!this.running && !this.timer && this.dirty) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch(() => {});
      }, this.wait);
    }
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) return this.running;
    if (!this.active || !this.dirty) return Promise.resolve();

    this.running = Promise.resolve().then(async () => {
      try {
        while (this.active && this.dirty) {
          const submitted = structuredClone(this.draft), encoded = this.encoded;
          this.notify({state: 'saving', dirty: true});
          await this.persist(submitted);
          this.saved = encoded;
        }
        if (this.active) this.notify({state: this.dirty ? 'pending' : 'saved', dirty: this.dirty});
      } catch (error) {
        if (this.active) this.notify({state: 'error', dirty: this.dirty, error: error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'});
        throw error;
      }
    }).then(() => {
      this.running = null;
      // Include edits arriving as the preceding write finishes, for every waiter.
      if (this.active && this.dirty) return this.flush();
    }, error => {
      this.running = null;
      throw error;
    });
    return this.running;
  }
}
