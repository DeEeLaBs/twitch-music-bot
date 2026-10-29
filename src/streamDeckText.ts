export type StreamDeckState = 'not-bundled' | 'streamdeck-missing' | 'not-installed' | 'update-available' | 'up-to-date';

export interface StreamDeckStatusInfo {
  state: StreamDeckState;
  bundledVersion: string | null;
  installedVersion: string | null;
}

export interface StreamDeckView {
  badge: string;
  tone: 'ok' | 'warn' | 'neutral';
  message: string;
  /** Label of the install button, or null when there is nothing the user can click. */
  action: string | null;
}

/** The plugin versions look like "1.0.0.0"; users only care about the first three parts. */
export function shortVersion(version: string | null): string {
  return (version ?? '').replace(/^(\d+\.\d+\.\d+)\.0$/, '$1');
}

export function describeStreamDeck(status: StreamDeckStatusInfo, language: 'de' | 'en'): StreamDeckView {
  const de = language === 'de';
  switch (status.state) {
    case 'not-bundled':
      return {
        badge: de ? 'Nicht enthalten' : 'Not included',
        tone: 'neutral',
        message: de
          ? 'Dieses Build enthält das Stream-Deck-Plugin nicht. Entwickler: „npm run streamdeck:pack“ ausführen und neu bauen.'
          : 'This build does not include the Stream Deck plugin. Developers: run "npm run streamdeck:pack" and rebuild.',
        action: null
      };
    case 'streamdeck-missing':
      return {
        badge: de ? 'Stream Deck fehlt' : 'Stream Deck missing',
        tone: 'warn',
        message: de
          ? 'Die Stream-Deck-App wurde nicht gefunden. Installiere sie von elgato.com, starte sie einmal und öffne diese Seite erneut.'
          : 'The Stream Deck app was not found. Install it from elgato.com, start it once and reopen this page.',
        action: null
      };
    case 'not-installed':
      return {
        badge: de ? 'Nicht installiert' : 'Not installed',
        tone: 'neutral',
        message: de
          ? 'Ein Klick öffnet das Plugin in der Stream-Deck-App. Bestätige dort die Installation.'
          : 'One click opens the plugin in the Stream Deck app. Confirm the installation there.',
        action: de ? 'In Stream Deck installieren' : 'Install in Stream Deck'
      };
    case 'update-available':
      return {
        badge: de ? 'Update verfügbar' : 'Update available',
        tone: 'warn',
        message: de
          ? `Installiert: ${shortVersion(status.installedVersion)}, in diesem Bot enthalten: ${shortVersion(status.bundledVersion)}. Bestätige das Update in der Stream-Deck-App.`
          : `Installed: ${shortVersion(status.installedVersion)}, included in this bot: ${shortVersion(status.bundledVersion)}. Confirm the update in the Stream Deck app.`,
        action: de ? 'Plugin aktualisieren' : 'Update plugin'
      };
    case 'up-to-date':
      return {
        badge: de ? 'Aktuell ✓' : 'Up to date ✓',
        tone: 'ok',
        message: de
          ? `Version ${shortVersion(status.installedVersion)} ist installiert. Die Aktionen findest du in Stream Deck unter „Twitch Music Bot“.`
          : `Version ${shortVersion(status.installedVersion)} is installed. Find the actions in Stream Deck under "Twitch Music Bot".`,
        action: de ? 'Neu installieren' : 'Reinstall'
      };
  }
}
