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

/**
 * Stores bot credentials outside bot-config.json.
 *
 * On Windows, DPAPI is used through PowerShell's SecureString cmdlets. This is
 * intentionally used instead of directly referencing the .NET ProtectedData
 * type because that type is not loaded/available in every Windows PowerShell
 * installation. If DPAPI is unavailable for any reason, only the affected
 * secret falls back to AES-GCM with a local 256-bit key so saving settings can
 * never prevent the bot from starting or connecting.
 */
export class SecureTokenStore {
  private file: string;
  private keyFile: string;
  // New secrets intentionally use the platform-independent AES-GCM store.
  // This avoids PowerShell/.NET DPAPI compatibility problems on Windows.
  private preferredMode: SecretMode = 'local-aes';
  private lastError = '';
  private cachedLocalKey: Buffer | null = null;

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

  private unprotectLocal(value: string): string {
    const all = Buffer.from(value, 'base64');
    if (all.length < 29) throw new Error('Local secret payload is invalid.');
    const iv = all.subarray(0, 12);
    const tag = all.subarray(12, 28);
    const enc = all.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.localKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
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

  private localKey(): Buffer {
    if (this.cachedLocalKey && this.cachedLocalKey.length === 32) return this.cachedLocalKey;
    fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
    if (!fs.existsSync(this.keyFile)) fs.writeFileSync(this.keyFile, crypto.randomBytes(32), { mode: 0o600 });
    let key = fs.readFileSync(this.keyFile);
    if (key.length !== 32) {
      // A damaged key cannot decrypt old local secrets, but replacing it is
      // preferable to permanently preventing settings from being saved.
      key = crypto.randomBytes(32);
      fs.writeFileSync(this.keyFile, key, { mode: 0o600 });
      this.lastError = 'Lokaler Secret-Schlüssel war beschädigt und wurde neu erstellt.';
    }
    this.cachedLocalKey = key;
    return key;
  }

  private readFile(): SecretFileV2 {
    // Multiple services share this file. Read the latest contents before each
    // access so one service cannot overwrite credentials saved by another.
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as SecretFile;
        if (parsed?.version === 2 && parsed.values && typeof parsed.values === 'object') {
          return parsed;
        }
        if (parsed?.version === 1 && parsed.values && typeof parsed.values === 'object') {
          // v1 used one encryption mode for the entire file. Convert the shape
          // without re-encrypting; values are migrated on their next update.
          const values: SecretFileV2['values'] = {};
          for (const key of ['twitchBotOauthToken', 'twitchRefreshToken', 'twitchTokenExpiresAt', 'twitchClientSecret', 'ytmdaAuthToken', 'spotifyRefreshToken'] as SecretKey[]) {
            const value = parsed.values[key];
            if (typeof value === 'string' && value) values[key] = { mode: parsed.mode, value };
          }
          const migrated: SecretFileV2 = { version: 2, values };
          writeJson(this.file, migrated);
          return migrated;
        }
      }
    } catch (error) {
      this.lastError = `Secret-Datei konnte nicht gelesen werden: ${String(error)}`;
    }
    const empty: SecretFileV2 = { version: 2, values: {} };
    return empty;
  }

  get(key: SecretKey): string {
    const secret = this.readFile().values[key];
    if (!secret) return '';
    try {
      const value = this.unprotect(secret);
      this.lastError = '';
      return value;
    } catch (error) {
      this.lastError = `Gespeichertes Secret konnte nicht entschlüsselt werden: ${String(error)}`;
      return '';
    }
  }

  set(key: SecretKey, value: string): void {
    const data = this.readFile();
    if (value) data.values[key] = this.protect(value);
    else delete data.values[key];
    writeJson(this.file, data);
  }

  diagnostics() {
    const data = this.readFile();
    const modes = Object.fromEntries(Object.entries(data.values).map(([key, secret]) => [key, secret?.mode]));
    return {
      preferredMode: this.preferredMode,
      modes,
      fileExists: fs.existsSync(this.file),
      fallbackActive: false,
      storageMode: 'local-aes',
      lastError: this.lastError || undefined
    };
  }
}
