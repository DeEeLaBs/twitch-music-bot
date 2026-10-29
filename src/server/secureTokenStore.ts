import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { writeJson } from './atomicStore.ts';

type SecretKey = 'twitchBotOauthToken' | 'twitchRefreshToken' | 'twitchTokenExpiresAt' | 'twitchClientSecret' | 'ytmdaAuthToken' | 'spotifyRefreshToken';
type SecretMode = 'dpapi' | 'local-aes';
interface StoredSecret { mode: SecretMode; value: string; }
interface SecretFileV2 { version: 2; values: Partial<Record<SecretKey, StoredSecret>>; }
interface SecretFileV1 { version: 1; mode: SecretMode; values: Partial<Record<SecretKey, string>>; salt?: string; }
type SecretFile = SecretFileV1 | SecretFileV2;

export type SecretStoreProblem = 'key-missing' | 'key-invalid' | 'store-unreadable' | 'decrypt-failed';
const PROBLEM_MESSAGES: Record<SecretStoreProblem, string> = {
  'key-missing': 'The encryption key file (.secret-key) for the stored credentials is missing.',
  'key-invalid': 'The encryption key file (.secret-key) for the stored credentials is damaged.',
  'store-unreadable': 'The stored credentials file (secrets.json) is unreadable and no usable backup exists.',
  'decrypt-failed': 'The stored credentials cannot be decrypted with the available encryption key.'
};

/** Raised instead of replacing key material or credential files that may still be recoverable. */
export class SecretStoreError extends Error {
  readonly code: SecretStoreProblem;
  constructor(code: SecretStoreProblem) {
    super(PROBLEM_MESSAGES[code]);
    this.name = 'SecretStoreError';
    this.code = code;
  }
}

/**
 * Stores bot credentials outside bot-config.json.
 *
 * On Windows, DPAPI is used through PowerShell's SecureString cmdlets. This is
 * intentionally used instead of directly referencing the .NET ProtectedData
 * type because that type is not loaded/available in every Windows PowerShell
 * installation. If DPAPI is unavailable for any reason, only the affected
 * secret falls back to AES-GCM with a local 256-bit key so saving settings can
 * never prevent the bot from starting or connecting.
 *
 * Existing credentials are never discarded to make room for new ones. A missing
 * or damaged key, or an unreadable secrets file, is reported through
 * SecretStoreError; the original files stay untouched until the user explicitly
 * starts over, which moves them aside (archiveUnrecoverable).
 */
export class SecureTokenStore {
  private file: string;
  private keyFile: string;
  // New secrets intentionally use the platform-independent AES-GCM store.
  // This avoids PowerShell/.NET DPAPI compatibility problems on Windows.
  private preferredMode: SecretMode = 'local-aes';
  private lastError = '';
  private readState: 'ok' | 'recovered' | 'unreadable' = 'ok';

  constructor(
    file = path.join(process.cwd(), 'data', 'secrets.json'),
    keyFile = path.join(process.cwd(), 'data', '.secret-key')
  ) {
    this.file = file;
    this.keyFile = keyFile;
  }

  private runPowerShell(script: string, secret: string): string {
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        env: { ...process.env, BOT_SECRET: secret },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    ).trim();
  }

  private unprotectDpapi(value: string): string {
    const script = [
      '$ErrorActionPreference="Stop"',
      '$s=ConvertTo-SecureString -String $env:BOT_SECRET',
      '$c=New-Object System.Management.Automation.PSCredential("bot",$s)',
      '[Console]::Out.Write($c.GetNetworkCredential().Password)'
    ].join(';');
    try {
      return this.runPowerShell(script, value);
    } catch {
      // Compatibility with v1.4.0 installations that successfully stored a
      // raw ProtectedData/DPAPI Base64 payload before this implementation.
      const legacyScript = [
        '$ErrorActionPreference="Stop"',
        'Add-Type -AssemblyName System.Security',
        '$e=[Convert]::FromBase64String($env:BOT_SECRET)',
        '$b=[Security.Cryptography.ProtectedData]::Unprotect($e,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
        '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($b))'
      ].join(';');
      return this.runPowerShell(legacyScript, value);
    }
  }

  private protectLocal(value: string): string {
    const key = this.localKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  private decryptLocal(value: string, key: Buffer): string {
    try {
      const all = Buffer.from(value, 'base64');
      if (all.length < 29) throw new Error('Local secret payload is invalid.');
      const iv = all.subarray(0, 12);
      const tag = all.subarray(12, 28);
      const enc = all.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch {
      throw new SecretStoreError('decrypt-failed');
    }
  }

  private unprotectLocal(value: string): string {
    return this.decryptLocal(value, this.existingKey());
  }

  private protect(value: string): StoredSecret {
    // Never invoke PowerShell while saving. Pairing and settings must not fail
    // because a Windows/.NET DPAPI type is unavailable.
    this.lastError = '';
    return { mode: 'local-aes', value: value ? this.protectLocal(value) : '' };
  }

  private unprotect(secret: StoredSecret): string {
    if (!secret.value) return '';
    if (secret.mode === 'dpapi') return this.unprotectDpapi(secret.value);
    return this.unprotectLocal(secret.value);
  }

  /** Reads the key without ever creating or replacing it. */
  private existingKey(): Buffer {
    if (!fs.existsSync(this.keyFile)) throw new SecretStoreError('key-missing');
    const key = fs.readFileSync(this.keyFile);
    if (key.length !== 32) throw new SecretStoreError('key-invalid');
    return key;
  }

  /** Creates the key only when none exists; an existing key is never overwritten. */
  private localKey(): Buffer {
    if (!fs.existsSync(this.keyFile)) {
      fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
      try {
        fs.writeFileSync(this.keyFile, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    return this.existingKey();
  }

  private parseSecretFile(file: string): { data: SecretFileV2; legacy: boolean } | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SecretFile;
      if (parsed?.version === 2 && parsed.values && typeof parsed.values === 'object') return { data: parsed, legacy: false };
      if (parsed?.version === 1 && parsed.values && typeof parsed.values === 'object') {
        // v1 used one encryption mode for the entire file. Convert the shape
        // without re-encrypting; values are migrated on their next update.
        const values: SecretFileV2['values'] = {};
        for (const key of ['twitchBotOauthToken', 'twitchRefreshToken', 'twitchTokenExpiresAt', 'twitchClientSecret', 'ytmdaAuthToken', 'spotifyRefreshToken'] as SecretKey[]) {
          const value = parsed.values[key];
          if (typeof value === 'string' && value) values[key] = { mode: parsed.mode, value };
        }
        return { data: { version: 2, values }, legacy: true };
      }
    } catch { /* handled by the caller */ }
    return null;
  }

  private readFile(): SecretFileV2 {
    // Multiple services share this file. Read the latest contents before each
    // access so one service cannot overwrite credentials saved by another.
    this.readState = 'ok';
    if (!fs.existsSync(this.file)) return { version: 2, values: {} };
    const current = this.parseSecretFile(this.file);
    if (current) {
      if (current.legacy) { try { writeJson(this.file, current.data); } catch { /* migrated again on the next read */ } }
      return current.data;
    }
    const backup = fs.existsSync(this.file + '.backup') ? this.parseSecretFile(this.file + '.backup') : null;
    if (backup) {
      this.readState = 'recovered';
      this.lastError = 'Secret-Datei war beschädigt; die Zugangsdaten wurden aus der Sicherung gelesen.';
      return backup.data;
    }
    this.readState = 'unreadable';
    this.lastError = 'Secret-Datei konnte nicht gelesen werden.';
    return { version: 2, values: {} };
  }

  private assess(): { data: SecretFileV2; problem?: SecretStoreProblem } {
    const data = this.readFile();
    if (this.readState === 'unreadable') return { data, problem: 'store-unreadable' };
    const local = Object.values(data.values).filter(secret => secret?.mode === 'local-aes' && secret.value);
    if (!local.length) return { data };
    try {
      const key = this.existingKey();
      for (const secret of local) this.decryptLocal(secret!.value, key);
    } catch (error) {
      return { data, problem: error instanceof SecretStoreError ? error.code : 'decrypt-failed' };
    }
    return { data };
  }

  /** Reports why stored credentials cannot be used, without modifying anything. */
  public problem(): SecretStoreProblem | undefined {
    return this.assess().problem;
  }

  /** Like get(), but tells "nothing stored" apart from "stored but unusable". */
  public read(key: SecretKey): { value: string; problem?: SecretStoreProblem } {
    const data = this.readFile();
    if (this.readState === 'unreadable') return { value: '', problem: 'store-unreadable' };
    const secret = data.values[key];
    if (!secret) return { value: '' };
    try {
      const value = this.unprotect(secret);
      if (this.readState === 'ok') this.lastError = '';
      return { value };
    } catch (error) {
      const problem = error instanceof SecretStoreError ? error.code : 'decrypt-failed';
      this.lastError = `Gespeichertes Secret konnte nicht entschlüsselt werden: ${PROBLEM_MESSAGES[problem]}`;
      return { value: '', problem };
    }
  }

  get(key: SecretKey): string {
    return this.read(key).value;
  }

  set(key: SecretKey, value: string): void {
    const { data, problem } = this.assess();
    if (problem) throw new SecretStoreError(problem);
    const recovered = this.readState === 'recovered';
    // The damaged original stays on disk; the rewritten file replaces it only
    // after a copy exists and without rotating the good backup away.
    if (recovered) fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
    if (value) data.values[key] = this.protect(value);
    else delete data.values[key];
    writeJson(this.file, data, { preserveBackup: recovered });
  }

  /**
   * Moves unusable credential files aside so the user can sign in again. Nothing
   * is deleted or overwritten; the renamed files keep every byte for a later manual restore.
   */
  public archiveUnrecoverable(): string[] {
    const problem = this.problem();
    if (!problem) return [];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const moved: string[] = [];
    const moveAside = (file: string) => {
      if (!fs.existsSync(file)) return;
      const target = `${file}.unrecoverable-${stamp}`;
      fs.renameSync(file, target);
      moved.push(target);
    };
    moveAside(this.file);
    moveAside(this.file + '.backup');
    if (problem === 'key-invalid') moveAside(this.keyFile);
    this.lastError = '';
    return moved;
  }

  diagnostics() {
    const { data, problem } = this.assess();
    const modes = Object.fromEntries(Object.entries(data.values).map(([key, secret]) => [key, secret?.mode]));
    return {
      preferredMode: this.preferredMode,
      modes,
      fileExists: fs.existsSync(this.file),
      fallbackActive: false,
      storageMode: 'local-aes',
      problem,
      lastError: this.lastError || undefined
    };
  }
}
