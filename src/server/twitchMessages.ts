import type { BotConfig } from '../types.ts';

export type ChatLanguage = 'de' | 'en';

type MessageArgs = Record<string, string | number>;

const STRINGS: Record<ChatLanguage, Record<string, string>> = {
  de: {
    wrongSongFailed: "@{user} Dein Songwunsch konnte nicht zurückgezogen werden. Bitte erneut versuchen.",
    playlistLink: "🔗 Hier findest du unsere Stream-Playlist: {url}",
    playlistLinkMissing: "ℹ️ Es ist noch kein Playlist-Link konfiguriert.",
    wrongSongMissing: "@{user} Du hast keinen offenen Songwunsch.",
    wrongSongExpired: "@{user} Songwünsche können nur innerhalb von 60 Sekunden zurückgezogen werden.",
    wrongSongRemoved: "🗑️ @{user} Dein Songwunsch '{title}' wurde zurückgezogen.",
    wrongSongRefunded: "@{user} Deine Kanalpunkte wurden erstattet.",
    wrongSongRefundFailed: "@{user} Die Kanalpunkte konnten nicht erstattet werden. Bitte einen Moderator kontaktieren.",

    help: '🤖 Befehle: 🎵 !sr <Lied/YouTube-/Spotify-Link> | 🎶 !song (Läuft gerade) | 📋 !queue (Warteschlange) | 🔊 !vol <0-100> (Lautstärke) | 🗳️ !voteskip | 🗑️ !wrongsong (60s) | 🔗 !playlist link | ⚙️ Mods: !skip, !veto, !clearqueue, !pause, !resume, !blacklist, !playlist',
    volUsage: '@{user} ℹ️ Nutze: !vol <0-100> um die Lautstärke zu ändern 🔊',
    volSet: '🔊 Lautstärke wurde auf {vol}% gestellt von @{user} 🎶',
    volBounds: '@{user} ⚠️ Die Lautstärke muss zwischen 0 und 100 liegen!',
    skipModOnly: '@{user} ⚠️ !skip ist ein Mod-Befehl. Nutze stattdessen !voteskip.',
    skippedNext: '⏭️ Übersprungen von @{user} -> Jetzt läuft: {title} ({artist})',
    skippedEmpty: '⏭️ Übersprungen von @{user}. Warteschlange leer; YTM Radio läuft weiter 📻',
    skippedEmptySpotify: '⏭️ Übersprungen von @{user}. Warteschlange leer; Spotify übernimmt die weitere Wiedergabe.',
    vetoed: '🗑️ Veto: "{title}" aus der Warteschlange entfernt.',
    vetoUsage: '@{user} ℹ️ Nutze: !veto <Position oder Songtitel>.',
    vetoNotFound: '@{user} ⚠️ Song nicht in der Warteschlange gefunden.',
    queueCleared: '🧹 Warteschlange geleert ({count} Songs entfernt).',
    paused: '⏸️ Wiedergabe pausiert von @{user}',
    resumed: '▶️ Wiedergabe fortgesetzt von @{user}',
    blacklistAdded: '🚫 "{term}" zur Blacklist hinzugefügt.',
    blacklistRemoved: '✅ "{term}" von der Blacklist entfernt.',
    blacklistNotFound: '⚠️ "{term}" nicht auf der Blacklist gefunden.',
    blacklistUsage: '@{user} ℹ️ Nutze: !blacklist add <Begriff> oder !blacklist remove <Begriff>.',
    playerCommandFailed: '⚠️ Player-Befehl fehlgeschlagen. Prüfe die Verbindung zum gewählten Player.',
    srUsage: '@{user} ℹ️ Nutzung: !sr <Songtitel, YouTube- oder Spotify-Link>',
    srTooLong: '@{user} ⚠️ Der Songrequest ist zu lang. Bitte nutze höchstens 500 Zeichen.',
    srAdded: '@{user} -> Zur Warteschlange hinzugefügt #{pos}: {title} 🎵',
    srSpotifyAdded: '@{user} -> Spotify-Request erkannt ✅ #{pos}: {title} (Spotify Premium, falls aktiviert; sonst YouTube Music)',
    srSpotifyAddedDirect: '@{user} -> Spotify-Request erkannt ✅ #{pos}: {title} 🎵',
    srSpotifyNotFound: '@{user} ⚠️ Spotify-Link erkannt, aber kein eindeutiger Treffer auf YouTube Music gefunden. Bitte nutze !sr Interpret - Titel.',
    srSpotifyTrackOnly: '@{user} ⚠️ Aktuell werden nur einzelne Spotify-Track-Links unterstützt, keine Playlist-/Album-/Artist-Links.',
    srNotFound: '@{user} ⚠️ Song "{query}" nicht gefunden oder nicht auflösbar.',
    srError: '@{user} ⚠️ {error}',
    srRefunded: '@{user} ⚠️ Song konnte nicht hinzugefügt werden ({error}). Deine Kanalpunkte wurden zurückerstattet! 🪙',
    npPlaying: '🎶 Läuft gerade: {title} - {artist}{reqInfo} ({url})',
    npReqBy: ' [Gewünscht von @{user}]',
    npNothing: '🎶 Momentan wird nichts in YouTube Music abgespielt.',
    npNothingSpotify: '🎶 Momentan wird nichts in Spotify abgespielt.',
    qEmpty: '📋 Warteschlange ist leer! Wünsch dir einen Song mit !sr <Titel oder Link>',
    qList: '📋 Warteschlange ({count} Songs): {next3}{more}',
    qMore: ' (+{count} weitere)',
    vsNoSong: '@{user} ⚠️ Momentan läuft kein Song zum Überspringen.',
    vsAlready: '@{user} ℹ️ Du hast bereits für einen Skip gestimmt ({current}/{required} Stimmen).',
    vsPassed: '⏭️ Vote skip erfolgreich ({current}/{required})! Überspringe aktuellen Song...',
    vsVipPassed: '⏭️ Sofort-Skip durch {role} @{user}! Überspringe aktuellen Song...',
    vsVoted: '🗳️ Vote skip: @{user} hat abgestimmt ({current}/{required} benötigt).',
    requestCooldown: '@{user} Bitte kurz warten, bevor du erneut einen Song anfragst.',
    skipFailed: 'Songwechsel fehlgeschlagen oder läuft bereits.',
    companionAuth: 'Autorisierung abgelehnt (HTTP {status}). Bitte neu koppeln.',
    companionTooMany: 'Begleitserver: Zu viele Anfragen. Bitte kurz warten.',
    companionHttp: 'Begleitserver meldet HTTP {status}.',
    companionUnavailable: 'Begleitserver nicht erreichbar oder Zeitüberschreitung.',
    companionPaused: 'Begleitserver nach mehreren Fehlern kurz pausiert.',
    companionWait: 'Begleitserver: Bitte nach der Wartezeit erneut versuchen.',
    invalidVideoId: 'Ungültige Video-ID.',
    volumeBoundsRuntime: 'Lautstärke muss zwischen 0 und 100 liegen.',
    playbackFailedKeep: 'Wiedergabe fehlgeschlagen. Request bleibt erhalten.',
    startNotConfirmed: 'Songstart nach 20 Sekunden nicht bestätigt. Request bleibt erhalten; mit „Nächsten Request starten“ erneut versuchen.',
    restoredRequest: 'Request aus letzter Sitzung wiederhergestellt. Mit „Nächsten Request starten“ fortsetzen.',
    playlistAdded: '🌟 "{title} - {artist}" wurde zur Stream-Playlist hinzugefügt! (von @{user})',
    playlistAlreadyExists: '@{user} ℹ️ "{title}" ist bereits in der Stream-Playlist.',
    playlistNoSong: '@{user} ⚠️ Es läuft gerade kein Song, der hinzugefügt werden könnte.',
    playlistFailed: '⚠️ Song konnte nicht zur Playlist hinzugefügt werden.',
    playlistList: '📜 Stream-Playlist ({count} Songs): {items}',
    playlistEmpty: '📜 Die Stream-Playlist ist noch leer.'
  },
  en: {
    wrongSongFailed: "@{user} Your request could not be withdrawn. Please try again.",
    playlistLink: "🔗 Find our stream playlist here: {url}",
    playlistLinkMissing: "ℹ️ No playlist link is configured yet.",
    wrongSongMissing: "@{user} You have no pending song request.",
    wrongSongExpired: "@{user} Requests can only be withdrawn within 60 seconds.",
    wrongSongRemoved: "🗑️ @{user} Your song request '{title}' was withdrawn.",
    wrongSongRefunded: "@{user} Your channel points were refunded.",
    wrongSongRefundFailed: "@{user} Channel points could not be refunded. Please contact a moderator.",

    help: '🤖 Commands: 🎵 !sr <song/YouTube/Spotify link> | 🎶 !song (Now playing) | 📋 !queue (Show list) | 🔊 !vol <0-100> (Volume) | 🗳️ !voteskip | 🗑️ !wrongsong (60s) | 🔗 !playlist link | ⚙️ Mods: !skip, !veto, !clearqueue, !pause, !resume, !blacklist, !playlist',
    volUsage: '@{user} ℹ️ Usage: !vol <0-100> to change volume 🔊',
    volSet: '🔊 Volume set to {vol}% by @{user} 🎶',
    volBounds: '@{user} ⚠️ Volume must be between 0 and 100!',
    skipModOnly: '@{user} ⚠️ !skip is a moderator command. Use !voteskip instead.',
    skippedNext: '⏭️ Skipped by @{user} -> Now Playing: {title} ({artist})',
    skippedEmpty: '⏭️ Skipped by @{user}. Queue empty; YouTube Music radio continuing 📻',
    skippedEmptySpotify: '⏭️ Skipped by @{user}. Queue empty; Spotify handles further playback.',
    vetoed: '🗑️ Vetoed: "{title}" removed from queue.',
    vetoNotFound: '@{user} ⚠️ Track not found in queue.',
    vetoUsage: '@{user} ℹ️ Usage: !veto <position or song title>.',
    queueCleared: '🧹 Queue cleared ({count} songs removed).',
    paused: '⏸️ Playback paused by @{user}',
    resumed: '▶️ Playback resumed by @{user}',
    blacklistAdded: '🚫 Added "{term}" to blacklist.',
    blacklistRemoved: '✅ Removed "{term}" from blacklist.',
    blacklistNotFound: '⚠️ "{term}" not found in blacklist.',
    blacklistUsage: '@{user} ℹ️ Usage: !blacklist add <term> or !blacklist remove <term>.',
    playerCommandFailed: '⚠️ Player command failed. Check the connection to the selected player.',
    srUsage: '@{user} ℹ️ Usage: !sr <song title, YouTube or Spotify link>',
    srTooLong: '@{user} ⚠️ The song request is too long. Please use at most 500 characters.',
    srAdded: '@{user} -> Added to queue #{pos}: {title} 🎵',
    srSpotifyAdded: '@{user} -> Spotify request recognized ✅ #{pos}: {title} (Spotify Premium if enabled; otherwise YouTube Music)',
    srSpotifyAddedDirect: '@{user} -> Spotify request recognized ✅ #{pos}: {title} 🎵',
    srSpotifyNotFound: '@{user} ⚠️ Spotify link recognized, but no clear YouTube Music match was found. Please use !sr Artist - Title.',
    srSpotifyTrackOnly: '@{user} ⚠️ Only individual Spotify track links are supported right now, not playlist/album/artist links.',
    srNotFound: '@{user} ⚠️ Could not find or resolve song "{query}".',
    srError: '@{user} ⚠️ {error}',
    srRefunded: '@{user} ⚠️ Song could not be added ({error}). Your channel points have been refunded! 🪙',
    npPlaying: '🎶 Currently Playing: {title} - {artist}{reqInfo} ({url})',
    npReqBy: ' [Req by @{user}]',
    npNothing: '🎶 Nothing currently playing in YouTube Music.',
    npNothingSpotify: '🎶 Nothing currently playing in Spotify.',
    qEmpty: '📋 Queue is empty! Request a song with !sr <song title or link>',
    qList: '📋 Queue ({count} songs): {next3}{more}',
    qMore: ' (+{count} more)',
    vsNoSong: '@{user} ⚠️ No song is currently playing to skip.',
    vsAlready: '@{user} ℹ️ You have already voted to skip ({current}/{required} votes).',
    vsPassed: '⏭️ Vote skip passed ({current}/{required})! Skipping current song...',
    vsVipPassed: '⏭️ Instant skip by {role} @{user}! Skipping current song...',
    vsVoted: '🗳️ Vote skip: @{user} voted ({current}/{required} needed).',
    requestCooldown: '@{user} Please wait a moment before requesting another song.',
    skipFailed: 'Could not change the song, or a song change is already in progress.',
    companionAuth: 'Authorization rejected (HTTP {status}). Please pair again.',
    companionTooMany: 'Companion Server: too many requests. Please wait a moment.',
    companionHttp: 'Companion Server returned HTTP {status}.',
    companionUnavailable: 'Companion Server is unreachable or the request timed out.',
    companionPaused: 'Companion Server is temporarily paused after multiple errors.',
    companionWait: 'Companion Server: please wait before trying again.',
    invalidVideoId: 'Invalid video ID.',
    volumeBoundsRuntime: 'Volume must be between 0 and 100.',
    playbackFailedKeep: 'Playback failed. The request remains in the queue.',
    startNotConfirmed: 'Track start was not confirmed within 20 seconds. The request remains in the queue; use “Start next request” to try again.',
    restoredRequest: 'Request restored from the previous session. Continue with “Start next request”.',
    playlistAdded: '🌟 "{title} - {artist}" was added to the stream playlist! (by @{user})',
    playlistAlreadyExists: '@{user} ℹ️ "{title}" is already in the stream playlist.',
    playlistNoSong: '@{user} ⚠️ No song is currently playing to add to the playlist.',
    playlistFailed: '⚠️ Could not add song to the playlist.',
    playlistList: '📜 Stream playlist ({count} songs): {items}',
    playlistEmpty: '📜 The stream playlist is currently empty.'
  }
};

export function chatLanguage(config: Pick<BotConfig, 'language'>): ChatLanguage { return config.language === 'en' ? 'en' : 'de'; }
export function twitchMessage(language: ChatLanguage, key: string, args: MessageArgs = {}): string {
  let text = STRINGS[language]?.[key] || key;
  for (const [name, value] of Object.entries(args)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
export function localizeCompanionError(language: ChatLanguage, error: string): string {
  if (!error) return error;
  let match: RegExpMatchArray | null;
  const t = (key: string, args: MessageArgs = {}) => twitchMessage(language, key, args);
  if ((match = error.match(/^Autorisierung abgelehnt \(HTTP (\d+)\)\. Bitte neu koppeln\.$/))) return t('companionAuth', { status: match[1] });
  if ((match = error.match(/^Begleitserver meldet HTTP (\d+)\.$/))) return t('companionHttp', { status: match[1] });
  const direct: Record<string, string> = {
    'Begleitserver: Zu viele Anfragen. Bitte kurz warten.': 'companionTooMany',
    'Begleitserver nicht erreichbar oder Zeitüberschreitung.': 'companionUnavailable',
    'Begleitserver nach mehreren Fehlern kurz pausiert.': 'companionPaused',
    'Begleitserver: Bitte nach der Wartezeit erneut versuchen.': 'companionWait',
    'Ungültige Video-ID.': 'invalidVideoId',
    'Lautstärke muss zwischen 0 und 100 liegen.': 'volumeBoundsRuntime',
    'Wiedergabe fehlgeschlagen. Request bleibt erhalten.': 'playbackFailedKeep',
    'Songstart nach 20 Sekunden nicht bestätigt. Request bleibt erhalten; mit „Nächsten Request starten“ erneut versuchen.': 'startNotConfirmed',
    'Request aus letzter Sitzung wiederhergestellt. Mit „Nächsten Request starten“ fortsetzen.': 'restoredRequest'
  };
  return direct[error] ? t(direct[error]) : error;
}
