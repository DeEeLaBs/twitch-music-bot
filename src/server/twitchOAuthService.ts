import type { BotConfig } from '../types.ts';
import { SecureTokenStore, type SecretStoreProblem } from './secureTokenStore.ts';

const SCOPES = ['chat:read', 'chat:edit', 'channel:read:redemptions', 'channel:manage:redemptions', 'moderator:read:followers', 'channel:read:subscriptions', 'bits:read'];
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
type AuthState = { state: 'idle' | 'pending' | 'connected' | 'error'; userCode?: string; verificationUri?: string; expiresAt?: number; interval?: number; login?: string; error?: string };
type DeviceResponse = { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; message?: string };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; message?: string };

/** A renewal that failed. Transient failures keep the login usable and are retried later. */
export class TwitchRefreshError extends Error {
  readonly transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.name = 'TwitchRefreshError';
    this.transient = transient;
  }
}

export class TwitchOAuthService {
  private readonly getConfig: () => BotConfig;
  private readonly saveCredentials: (token: string, clientId: string, login: string) => void;
  private readonly secrets = new SecureTokenStore();
  private state: AuthState = { state: 'idle' };
  private deviceCode = '';
  private clientId = '';
  private nextPollAt = 0;
  private polling: Promise<AuthState> | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(getConfig: () => BotConfig, saveCredentials: (token: string, clientId: string, login: string) => void) {
    this.getConfig = getConfig;
    this.saveCredentials = saveCredentials;
  }

  public status(): AuthState {
    if (this.state.state === 'pending' && Date.now() >= (this.state.expiresAt || 0)) {
      this.fail(this.getConfig().language === 'en'
        ? 'The Twitch confirmation code has expired. Please start the login again.'
        : 'Der Twitch-Bestätigungscode ist abgelaufen. Bitte starte die Anmeldung erneut.');
    }
    if (this.state.state === 'idle') {
      const stored = this.secrets.read('twitchBotOauthToken');
      if (stored.problem) return { state: 'error', error: this.storageProblemMessage(stored.problem) };
      const username = this.getConfig().twitchBotUsername;
      if (stored.value && username) {
        return { state: 'connected', login: username };
      }
    }
    return { ...this.state };
  }

  private storageProblemMessage(problem: SecretStoreProblem): string {
    const english = this.getConfig().language === 'en';
    const reason = {
      'key-missing': english ? 'the encryption key file (.secret-key) is missing' : 'die Schlüsseldatei (.secret-key) fehlt',
      'key-invalid': english ? 'the encryption key file (.secret-key) is damaged' : 'die Schlüsseldatei (.secret-key) ist beschädigt',
      'store-unreadable': english ? 'the credentials file (secrets.json) is unreadable and has no usable backup' : 'die Zugangsdaten-Datei (secrets.json) ist unlesbar und hat keine brauchbare Sicherung',
      'decrypt-failed': english ? 'the stored data does not match the encryption key (.secret-key)' : 'die gespeicherten Daten passen nicht zur Schlüsseldatei (.secret-key)'
    }[problem];
    return english
      ? `The saved Twitch login cannot be used because ${reason}. Your files were not changed. Restore the original files from the data folder, or choose "Connect with Twitch" to sign in again; the old files are then kept next to the new ones.`
      : `Die gespeicherte Twitch-Anmeldung ist nicht nutzbar, weil ${reason}. Deine Dateien wurden nicht verändert. Stelle die Originaldateien im data-Ordner wieder her oder wähle "Mit Twitch verbinden", um dich neu anzumelden; die alten Dateien bleiben dann neben den neuen erhalten.`;
  }

  /** True when the stored access token is known to be past its expiry time. */
  public isAccessTokenExpired(): boolean {
    const expiresAt = Number(this.secrets.get('twitchTokenExpiresAt'));
    return Boolean(expiresAt) && Date.now() >= expiresAt;
  }

  public setAuthError(error: string): void {
    this.fail(error);
  }

  public async start(clientId: string, clientSecret?: string): Promise<AuthState> {
    if (!/^[a-z0-9]{10,64}$/i.test(clientId)) throw new Error('Bitte eine gültige Twitch Client-ID eingeben.');
    // Signing in again is the explicit decision to start over, so unusable
    // credential files are moved aside (not deleted) to make room for new ones.
    this.secrets.archiveUnrecoverable();
    if (clientSecret) this.secrets.set('twitchClientSecret', clientSecret);
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch('https://id.twitch.tv/oauth2/device', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: clientId, scopes: SCOPES.join(' ') }), signal: AbortSignal.timeout(10000)
        });
        break;
      } catch {
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    if (!response) throw new Error(this.getConfig().language === 'en'
      ? 'Twitch could not be reached. Check your internet connection and try again.'
      : 'Twitch ist nicht erreichbar. Prüfe die Internetverbindung und versuche es erneut.');
    const payload = await response.json() as DeviceResponse;
    if (!response.ok || !payload.device_code || !payload.user_code || !payload.verification_uri) throw new Error(payload.message || 'Twitch konnte keinen Bestätigungscode erstellen.');
    const verification = new URL(payload.verification_uri);
    if (verification.protocol !== 'https:' || verification.hostname !== 'www.twitch.tv') throw new Error('Twitch hat eine ungültige Bestätigungsadresse geliefert.');
    this.deviceCode = payload.device_code;
    this.clientId = clientId;
    this.nextPollAt = Date.now() + Math.max(5, payload.interval || 5) * 1000;
    this.state = { state: 'pending', userCode: payload.user_code, verificationUri: verification.toString(),
      expiresAt: Date.now() + Math.max(60, payload.expires_in || 1800) * 1000, interval: Math.max(5, payload.interval || 5) };
    return this.status();
  }

  public async poll(): Promise<AuthState> {
    if (this.status().state !== 'pending' || Date.now() < this.nextPollAt) return this.status();
    if (this.polling) return this.polling;
    this.polling = this.exchangeDeviceCode().finally(() => { this.polling = null; });
    return this.polling;
  }

  private async exchangeDeviceCode(): Promise<AuthState> {
    this.nextPollAt = Date.now() + (this.state.interval || 5) * 1000;
    try {
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.clientId, device_code: this.deviceCode, scopes: SCOPES.join(' '), grant_type: DEVICE_GRANT }),
        signal: AbortSignal.timeout(10000)
      });
      const payload = await response.json() as TokenResponse;
      if (!response.ok) {
        if (payload.message === 'authorization_pending') return this.status();
        if (payload.message === 'slow_down') { this.nextPollAt += 5000; return this.status(); }
        return this.fail(payload.message || `Twitch-Anmeldung fehlgeschlagen (HTTP ${response.status}).`);
      }
      if (!payload.access_token || !payload.refresh_token) return this.fail('Twitch hat keinen erneuerbaren Benutzer-Token geliefert.');
      const validation = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${payload.access_token}` }, signal: AbortSignal.timeout(10000)
      });
      const identity = await validation.json() as { client_id?: string; login?: string; scopes?: string[]; message?: string };
      if (!validation.ok || identity.client_id !== this.clientId || !identity.login || !SCOPES.every(scope => identity.scopes?.includes(scope))) {
        return this.fail(identity.message || 'Der Twitch-Token gehört nicht zur Client-ID oder hat nicht alle benötigten Berechtigungen.');
      }
      this.secrets.set('twitchRefreshToken', payload.refresh_token);
      this.secrets.set('twitchTokenExpiresAt', String(Date.now() + Math.max(60, payload.expires_in || 14400) * 1000));
      this.saveCredentials(payload.access_token, this.clientId, identity.login);
      this.deviceCode = '';
      this.state = { state: 'connected', login: identity.login };
      return this.status();
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  public async refreshIfNeeded(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const refreshToken = this.secrets.get('twitchRefreshToken');
    const expiresAt = Number(this.secrets.get('twitchTokenExpiresAt'));
    const hasAccessToken = Boolean(this.getConfig().twitchBotOauthToken);
    if (!refreshToken || !this.getConfig().twitchClientId || (hasAccessToken && expiresAt && Date.now() < expiresAt - 10 * 60_000)) return;
    this.refreshing = this.refresh(refreshToken).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  public async resume(clientSecret?: string): Promise<AuthState> {
    if (!this.secrets.get('twitchRefreshToken') || !this.getConfig().twitchClientId) {
      throw new Error(this.getConfig().language === 'en' ? 'Please authorize Twitch again.' : 'Bitte Twitch erneut autorisieren.');
    }
    if (clientSecret?.trim()) this.secrets.set('twitchClientSecret', clientSecret.trim());
    await this.forceRefresh();
    return this.status();
  }

  /** Resolves to false when there is nothing renewable to refresh. */
  public async forceRefresh(): Promise<boolean> {
    if (this.refreshing) { await this.refreshing; return true; }
    const refreshToken = this.secrets.get('twitchRefreshToken');
    if (!refreshToken || !this.getConfig().twitchClientId) return false;
    this.refreshing = this.refresh(refreshToken).finally(() => { this.refreshing = null; });
    await this.refreshing;
    return true;
  }

  private async refresh(refreshToken: string): Promise<void> {
    const clientId = this.getConfig().twitchClientId;
    const clientSecret = this.secrets.get('twitchClientSecret') || this.getConfig().twitchClientSecret || '';
    const body: Record<string, string> = {
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    };
    if (clientSecret) {
      body.client_secret = clientSecret;
    }
    let response: Response;
    try {
      response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw new TwitchRefreshError(this.getConfig().language === 'en'
        ? 'Twitch could not be reached. The saved login is kept and renewal will be retried.'
        : 'Twitch ist nicht erreichbar. Die gespeicherte Anmeldung bleibt erhalten, die Erneuerung wird erneut versucht.', true);
    }
    const payload = await response.json().catch(() => ({})) as TokenResponse;
    if (!response.ok || !payload.access_token) {
      const msg = payload.message || 'Twitch-Token konnte nicht erneuert werden.';
      // Outages and rate limits say nothing about the credentials themselves.
      if (response.status >= 500 || response.status === 429 || response.status === 408) throw new TwitchRefreshError(msg, true);
      const userMsg = (msg.toLowerCase().includes('client secret') || msg.toLowerCase().includes('secret'))
        ? (this.getConfig().language === 'en'
            ? 'Twitch requires a Client Secret to refresh tokens. Enter your Twitch Client Secret in the settings or switch your Twitch Developer App to "Public".'
            : 'Twitch verlangt ein Client-Secret zur Token-Erneuerung. Trage dein Twitch Client-Secret in den Einstellungen ein oder stelle deine Twitch-App auf "Public" (Öffentlich) um.')
        : msg;
      this.fail(userMsg);
      throw new TwitchRefreshError(userMsg, false);
    }
    // Twitch may rotate the refresh token; when it does not, the stored one stays valid.
    if (payload.refresh_token && payload.refresh_token !== refreshToken) this.secrets.set('twitchRefreshToken', payload.refresh_token);
    this.secrets.set('twitchTokenExpiresAt', String(Date.now() + Math.max(60, payload.expires_in || 14400) * 1000));
    this.saveCredentials(payload.access_token, clientId, this.getConfig().twitchBotUsername);
    this.state = { state: 'connected', login: this.getConfig().twitchBotUsername };
  }

  private fail(error: string): AuthState {
    this.deviceCode = '';
    this.state = { state: 'error', error };
    return this.status();
  }
}
