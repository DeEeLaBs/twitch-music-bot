export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private threshold: number;
  private cooldownMs: number;

  constructor(threshold = 4, cooldownMs = 30_000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }
  canRun() { return Date.now() >= this.openUntil; }
  success() { this.failures = 0; this.openUntil = 0; }
  failure() { this.failures++; if (this.failures >= this.threshold) this.openUntil = Date.now() + this.cooldownMs; }
  diagnostics() { return { failures: this.failures, open: !this.canRun(), retryAt: this.openUntil || null }; }
}
