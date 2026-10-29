
export type Language = 'en' | 'de';

export const translations = {
  en: {
    streamPlaylistTitle: "Stream playlist",
    streamPlaylistUrlLabel: "Stream playlist link (optional)",
    streamPlaylistHint: "Favorites independent of the fallback playlist; leave blank to use the fallback.",
    streamPlaylistExport: "Export text / CSV",
    streamPlaylistOpen: "Open playlist",
    streamPlaylistDelete: "Delete",
    streamPlaylistEmpty: "No songs saved yet.",
    streamPlaylistError: "Could not load or save the playlist.",
    streamPlaylistAlert: "⭐ Added to the stream playlist: {title} - {artist} (by @{user})",
    streamPlaylistAddedBy: "Added by",
    streamPlaylistDate: "Date",
    streamPlaylistTrack: "Title / Artist",

    // App.tsx
    ytmConnected: "Connected to YouTube Music (Click for Settings)",
    ytmDisconnected: "Not connected. Click here for 1-Click Pairing!",
    connected: "Connected",
    connect: "Pair / Not connected",
    simulatorReady: "Simulator Ready",
    spotifyConnected: "Connected to Spotify",
    spotifyDisconnected: "Spotify not connected. Click for Settings!",
    twitchConnectedTitle: "Connected to Twitch channel",
    twitchDisconnectedTitle: "Twitch not connected (Simulator active). Click for Settings!",
    tabPlayer: "Player & Queue",
    tabYouTubeMusic: "YouTube Music",
    tabCommands: "Commands & Rules",
    tabChat: "Chat & Command Tester",
    tabOverlay: "OBS Overlay Studio",
    tabBlacklist: "Blacklist",
    tabSetup: "Setup Guide & Config",
    appSubtitle: "Twitch requests, playback and stream overlay in one place",
    connectionStatus: "Connection status",
    mainNavigation: "Main navigation",
    skipToContent: "Skip to main content",
    dashboardTitle: "Live control center",
    dashboardIntro: "Control playback and keep the request queue in view while you stream.",
    chatPageTitle: "Chat command lab",
    chatPageIntro: "Test commands safely and inspect bot feedback without opening Twitch chat.",
    overlayPageTitle: "Overlay designer",
    overlayPageIntro: "Create a readable now-playing overlay that matches your stream design.",
    blacklistPageTitle: "Content protection",
    blacklistPageIntro: "Manage terms, artists and channels that the bot should reject automatically.",
    settingsPageTitle: "Connections and settings",
    settingsPageIntro: "Connect Twitch and YouTube Music, then adjust the bot to your channel.",
    footerText: "Local dashboard · OBS overlay available at /overlay",
    requesterRole: "Requester role",
    chatLog: "Bot and chat log",
    chatMessage: "Chat message or command",
    blacklistRuleType: "Blacklist rule type",
    queueClearConfirm: "Remove all songs from the queue?",
    openTrack: "Open track",
    removeTrack: "Remove track from queue",
    pausePlayback: "Pause playback",
    resumePlayback: "Resume playback",
    dismissNotice: "Dismiss notification",

    // SetupGuide
    botPlaybackSettings: "Bot & Playback Settings",
    settingsSaved: "Settings Saved!",
    twitchChannel: "Twitch Channel (Streamer)",
    twitchBotUsername: "Bot Username",
    twitchBotOauth: "Twitch Bot OAuth Token",
    saveSettings: "Save Settings",
    // YtmPairingWizard
    ytmPairingTitle: "YouTube Music Desktop App Pairing",
    ytmNotConnected: "Not connected",
    ytmConnectedShort: "Connected",
    ytmOffAuth: "Official authentication process according to",
    ytmRunDiag: "Run Diagnostics",
    ytmTesting: "Testing connection...",
    ytm1ClickTitle: "1-Click Pairing Process",
    ytm1ClickDesc: "Start the official pairing process. The bot contacts YouTube Music on your PC and requests the pairing code.",
    ytmPairBtn: "Pair with YouTube Music now",
    ytmWaiting: "Waiting for confirmation...",
    ytmSettingsTitle: "Companion Server Settings in YTM",
    ytmOpen: "Open",
    ytmOnPC: "on your PC.",
    ytmClick: "Click on",
    ytmSettingsGear: "Settings (Gear icon)",
    ytmIntegrations: "Integrations",
    ytmEnable: "Enable",
    ytmEnableComp: "Enable Companion Server",
    ytmImportant: "IMPORTANT",
    ytmSwitch: "Turn",
    ytmEnableAuth: "Enable Companion-Server-Authorization",
    ytmAuthWindow: "ON! (Opens the 5-minute time window).",
    ytmEnterCode: "Enter Code",
    ytmCodePlaceholder: "Enter code from YTM here...",
    ytmPairBtnShort: "Pair",
    ytmSuccessPair: "Successfully paired!",
    ytmErrorPair: "Error pairing",
    ytmDeleteToken: "Delete Token & Reconnect",
    ytmStep1Start: "Open",
    ytmStep2Start: "Click on",
    ytmStep3Start: "Enable",
    ytmStep4Auth: "Enable Companion-Server-Authorization",

    // BlacklistManager
    blTitle: "Content Filters & Blacklist",
    blBadge: "Auto-Reject Traps & Ear-Rape",
    blDesc: "Any song requested in chat or channel points whose title or artist matches these terms will be automatically rejected.",
    blPlaceholder: "Enter word, phrase, or banned artist name...",
    blTypeKeyword: "Keyword Filter",
    blTypeArtist: "Banned Artist",
    blTypeChannel: "Channel Name",
    blAddBtn: "Add to Blacklist",
    blActiveRules: "Active Blacklist Rules",
    blEmpty: "No active blacklist rules. All clean song requests will be allowed.",
    blRemoveTitle: "Remove from blacklist",
    blAdded: "Added",
    blToBlacklist: "to blacklist.",

    // OverlayStudio
    ovPreview: "Real-Time Overlay Preview (Transparent in OBS)",
    ovTheme: "Theme:",
    ovThemeGlass: "Glassmorphic Dark",
    ovThemeNeon: "Neon Cyber Synth",
    ovThemeMinimal: "Minimal Slate",
    ovThemeLight: "Clean Light",
    ovProgress: "Progress Bar",
    ovUrlLabel: "OBS Browser Source URL",
    ovCopy: "Copy URL",
    ovCopied: "Copied!",
    ovDirectLink: "Direct link for OBS Studio or Streamlabs Browser Source",
    ovOpen: "Open Overlay",
    ovRecSettings: "Recommended OBS Settings",
    ovWidth: "Width",
    ovHeight: "Height",
    ovFps: "FPS",
    ovCustomCss: "Custom CSS (already transparent):",
    ovCopyCss: "Copy CSS",
    ovDesignerTitle: "Build your now-playing overlay",
    ovDesignerIntro: "Choose a style, layout and visible information. The OBS link updates automatically.",
    ovReset: "Reset design",
    ovChooseTheme: "Visual theme",
    ovThemeOcean: "Ocean Pulse",
    ovThemeSunset: "Sunset Glow",
    ovThemeTwitch: "Twitch Purple",
    ovThemeMono: "High Contrast",
    ovLayout: "Layout",
    ovLayoutHorizontal: "Horizontal",
    ovLayoutHorizontalDesc: "Balanced banner for most scenes",
    ovLayoutCompact: "Compact",
    ovLayoutCompactDesc: "Low profile for gameplay overlays",
    ovLayoutStacked: "Stacked",
    ovLayoutStackedDesc: "Large artwork for music-focused scenes",
    ovContent: "Content and size",
    ovArtwork: "Album artwork",
    ovRequester: "Requester",
    ovTime: "Elapsed time",
    ovAccent: "Accent color",
    ovScale: "Scale",
    ovRadius: "Corner radius",
    ovPreviewBackground: "Preview background",
    ovBgTransparent: "Grid",
    ovBgDark: "Dark",
    ovBgLight: "Light",
    ovReadyTitle: "Ready for OBS",
    ovCopyFailed: "Could not copy. Select the URL and copy it manually.",
    overlayNowPlaying: "Now playing",
    overlayPaused: "Paused",
    overlayRadio: "YouTube Music Radio",
    overlayRequestedBy: "Requested by",
    
    // NowPlayingCard
    npTitle: "Now Playing",
    npEmptyTitle: "No track currently active.",
    npEmptyDesc: "Request a song in chat with !sr <song> or start playback in the selected web player.",
    npModSkip: "Mod Skip",
    
    // Queue Roles
    qlRoleStreamer: "Streamer",
    qlRoleMod: "Mod",
    qlRoleVip: "VIP",
    qlRoleSub: "Sub",
    qlRoleViewer: "Viewer",
    qlUsername: "Username",

    // QueueList
    qlTitle: "FIFO Song Queue",
    qlAddManual: "Manual Request / Queue Track",
    qlPlaceholder: "Search song title & artist OR paste YouTube/YTM/Spotify link...",
    qlAddBtn: "Queue",
    qlEmptyTitle: "The request queue is empty",
    qlEmptyDesc: "The selected player can keep playing until viewers request songs.",
    qlClearBtn: "Clear Queue",

    // ChatSimulator
    csTitle: "Twitch Chat & Command Tester",
    csBadge: "Interactive Live Simulator",
    csTest: "Test",
    csEmpty: "No chat or bot logs yet. Try typing a command below or clicking a preset button!",
    csInputPlaceholder: "e.g. !sr Queen Bohemian Rhapsody, !sr <Spotify link>, !np, !voteskip",
    csSend: "Send",

    // Other common
    maxDuration: "Max Duration",
    maxPerViewer: "Max / Viewer",
    voteSkip: "Vote-Skip",
    language: "Language"
    ,loadingBot: "Loading bot…"
    ,apiUnavailable: "Bot is not reachable."
    ,actionFailed: "Action failed."
    ,playbackIdle: "Idle"
    ,playbackPlaying: "PLAYING"
    ,playbackRadio: "YTM Autoplay Radio Active"
    ,playbackVote: "Vote"
    ,playbackVoteButton: "+1 Vote"
    ,playbackVoteHint: "Simulate a chat !voteskip"
    ,playbackPlay: "Play"
    ,playbackSkip: "Skip"
    ,connectionLost: "Connection to the bot was interrupted. Reconnecting…"
    ,trackLoading: "The track is loading and its start is being verified…"
    ,startNextRequest: "Start next request / try again"
    ,openObsOverlay: "Open OBS Overlay in a new tab"
    ,channelPointsReward: "Channel Points: Song Request Reward ID (blank = disabled)"
    ,channelPointsTitle: "Song requests via Twitch Channel Points"
    ,channelPointsDesc: "Enable this to let viewers redeem a Twitch Channel Points reward and add the entered song to the queue."
    ,channelPointsEnable: "Enable Channel Points song requests"
    ,channelPointsSelect: "Channel Points reward"
    ,channelPointsLoad: "Load rewards"
    ,channelPointsLoading: "Loading rewards…"
    ,channelPointsChoose: "Select a reward…"
    ,channelPointsNone: "No available rewards found."
    ,channelPointsUnknown: "Currently configured reward"
    ,channelPointsInputHint: "Tip: use a reward that requires viewer text input so the song request can be read."
    ,channelPointsSaveFirst: "Enter your Twitch channel and token. Loading rewards will save them automatically."
    ,channelPointsChooseRequired: "Channel Points are enabled. Select a reward to start accepting redemptions."
    ,twitchTokenStatus: "Twitch token:"
    ,tokenStoredHint: "stored — leaving the field blank keeps it"
    ,tokenMissingHint: "not stored yet"
    ,saveFailed: "Could not save settings."
    ,launcherTitle: "Windows startup"
    ,launcherIntro: "Extract the ZIP completely. In the standalone edition, open Portable and double-click Start-Bot.vbs; Node.js is included. Only the source edition requires Node.js 22+ and Installieren.bat first. Use Stop-Bot.bat to stop a background bot."
    ,launcherHelp: "If something goes wrong, open Start-Bot.bat or check data/bot-error.log. Keep the complete folder together; individual launcher files are not enough."
    ,pairTitle: "Connect YouTube Music Desktop"
    ,embeddedYtmTitle: "YouTube Music web player"
    ,embeddedYtmConnected: "Web player connected"
    ,embeddedYtmDescription: "The bot controls the built-in YouTube Music player directly. No separate YTMDesktop app or pairing token is needed."
    ,pairAuthorized: "Connected and authorized"
    ,pairInstruction1: "Open YTMDesktop 2.x. Under Integrations, enable the Companion Server and its authorization window."
    ,pairInstruction2: "Choose “Pair again”, compare the codes, and approve the request in YTMDesktop within 30 seconds."
    ,pairInstruction3: "Pair only one bot instance: pairing again replaces the previous token."
    ,pairAgain: "Pair again"
    ,pairCancel: "Cancel"
    ,pairReset: "Reset token"
    ,done: "Done."
    ,requestFailed: "Request failed."
    ,or: "or"
    ,clickSuffix: "double-click."
    ,overlayWaiting: "Waiting for YouTube Music playback…"
    ,previousSong: "Previous track"
  },
  de: {
    streamPlaylistTitle: "Stream-Playlist",
    streamPlaylistUrlLabel: "Stream-Playlist-Link (optional)",
    streamPlaylistHint: "Favoriten unabhängig von der Fallback-Playlist; leer verwendet den Fallback.",
    streamPlaylistExport: "Als Text / CSV exportieren",
    streamPlaylistOpen: "Playlist öffnen",
    streamPlaylistDelete: "Löschen",
    streamPlaylistEmpty: "Noch keine Songs gespeichert.",
    streamPlaylistError: "Playlist konnte nicht geladen oder gespeichert werden.",
    streamPlaylistAlert: "⭐ Zur Stream-Playlist hinzugefügt: {title} - {artist} (von @{user})",
    streamPlaylistAddedBy: "Hinzugefügt von",
    streamPlaylistDate: "Datum",
    streamPlaylistTrack: "Titel / Interpret",

    // App.tsx
    ytmConnected: "Verbunden mit YouTube Music (Klicken für Einstellungen)",
    ytmDisconnected: "Nicht verbunden. Klicke hier für den 1-Klick Kopplungsprozess!",
    connected: "Verbunden",
    connect: "Koppeln / Nicht verbunden",
    simulatorReady: "Simulator bereit",
    spotifyConnected: "Mit Spotify verbunden",
    spotifyDisconnected: "Spotify nicht verbunden. Hier klicken für Einstellungen!",
    twitchConnectedTitle: "Mit Twitch-Kanal verbunden",
    twitchDisconnectedTitle: "Twitch nicht verbunden (Simulator aktiv). Hier klicken für Einstellungen!",
    tabPlayer: "Player & Warteschlange",
    tabYouTubeMusic: "YouTube Music",
    tabCommands: "Commands & Regeln",
    tabChat: "Chat & Befehlstester",
    tabOverlay: "OBS Overlay Studio",
    tabBlacklist: "Blacklist",
    tabSetup: "Setup & Einstellungen",
    appSubtitle: "Twitch-Wünsche, Wiedergabe und Stream-Overlay an einem Ort",
    connectionStatus: "Verbindungsstatus",
    mainNavigation: "Hauptnavigation",
    skipToContent: "Zum Hauptinhalt springen",
    dashboardTitle: "Live-Steuerzentrale",
    dashboardIntro: "Steuere die Wiedergabe und behalte während des Streams alle Songwünsche im Blick.",
    chatPageTitle: "Chat-Befehlslabor",
    chatPageIntro: "Teste Befehle sicher und prüfe Bot-Antworten, ohne den Twitch-Chat zu öffnen.",
    overlayPageTitle: "Overlay-Designer",
    overlayPageIntro: "Erstelle ein gut lesbares Now-Playing-Overlay passend zu deinem Stream-Design.",
    blacklistPageTitle: "Inhaltsschutz",
    blacklistPageIntro: "Verwalte Begriffe, Künstler und Kanäle, die der Bot automatisch ablehnen soll.",
    settingsPageTitle: "Verbindungen und Einstellungen",
    settingsPageIntro: "Verbinde Twitch und YouTube Music und passe den Bot an deinen Kanal an.",
    footerText: "Lokales Dashboard · OBS-Overlay unter /overlay verfügbar",
    requesterRole: "Rolle der wünschenden Person",
    chatLog: "Bot- und Chatprotokoll",
    chatMessage: "Chatnachricht oder Befehl",
    blacklistRuleType: "Typ der Blacklist-Regel",
    queueClearConfirm: "Alle Songs aus der Warteschlange entfernen?",
    openTrack: "Song öffnen",
    removeTrack: "Song aus der Warteschlange entfernen",
    pausePlayback: "Wiedergabe pausieren",
    resumePlayback: "Wiedergabe fortsetzen",
    dismissNotice: "Meldung schließen",

    // SetupGuide
    botPlaybackSettings: "Bot & Wiedergabe-Einstellungen",
    settingsSaved: "Einstellungen gespeichert!",
    twitchChannel: "Twitch Kanal (Streamer)",
    twitchBotUsername: "Bot Benutzername",
    twitchBotOauth: "Twitch Bot OAuth Token",
    saveSettings: "Einstellungen speichern",
    // YtmPairingWizard
    ytmPairingTitle: "YouTube Music Desktop App Kopplung",
    ytmNotConnected: "Nicht verbunden",
    ytmConnectedShort: "Verbunden",
    ytmOffAuth: "Offizieller Authentifizierungsprozess gemäß",
    ytmRunDiag: "Diagnose ausführen",
    ytmTesting: "Verbindung testen...",
    ytm1ClickTitle: "1-Klick Kopplungsprozess",
    ytm1ClickDesc: "Starte den offiziellen Kopplungsprozess. Der Bot kontaktiert YouTube Music auf deinem PC und fordert den Kopplungscode an.",
    ytmPairBtn: "Jetzt mit YouTube Music koppeln",
    ytmWaiting: "Warte auf Bestätigung...",
    ytmSettingsTitle: "Begleitserver Einstellungen in YTM",
    ytmOpen: "Öffne",
    ytmOnPC: "auf deinem PC.",
    ytmClick: "Klicke auf",
    ytmSettingsGear: "Einstellungen (Zahnrad)",
    ytmIntegrations: "Integrationen",
    ytmEnable: "Aktiviere",
    ytmEnableComp: "Begleitserver aktivieren",
    ytmImportant: "WICHTIG",
    ytmSwitch: "Schalte",
    ytmEnableAuth: "Begleitserver-Autorisierung aktivieren",
    ytmAuthWindow: "EIN! (Öffnet das 5-Minuten-Zeitfenster).",
    ytmEnterCode: "Code eingeben",
    ytmCodePlaceholder: "Code aus YTM hier eintragen...",
    ytmPairBtnShort: "Koppeln",
    ytmSuccessPair: "Erfolgreich gekoppelt!",
    ytmErrorPair: "Fehler bei der Kopplung",
    ytmDeleteToken: "Token löschen & Neu verbinden",
    ytmStep1Start: "Öffne",
    ytmStep2Start: "Klicke auf",
    ytmStep3Start: "Aktiviere",
    ytmStep4Auth: "Begleitserver-Autorisierung aktivieren",

    // BlacklistManager
    blTitle: "Inhaltsfilter & Blacklist",
    blBadge: "Troll-Schutz (Auto-Ablehnung)",
    blDesc: "Jeder Song, der im Chat oder über Kanalpunkte angefordert wird und dessen Titel oder Künstler mit diesen Begriffen übereinstimmt, wird automatisch abgelehnt.",
    blPlaceholder: "Wort, Phrase oder Künstlernamen eingeben...",
    blTypeKeyword: "Schlüsselwort-Filter",
    blTypeArtist: "Gesperrter Künstler",
    blTypeChannel: "Kanalname",
    blAddBtn: "Zur Blacklist hinzufügen",
    blActiveRules: "Aktive Blacklist-Regeln",
    blEmpty: "Keine aktiven Blacklist-Regeln. Alle sauberen Songwünsche werden zugelassen.",
    blRemoveTitle: "Von Blacklist entfernen",
    blAdded: "Begriff",
    blToBlacklist: "zur Blacklist hinzugefügt.",
    
    // OverlayStudio
    ovPreview: "Echtzeit Overlay-Vorschau (Transparent in OBS)",
    ovTheme: "Theme:",
    ovThemeGlass: "Glassmorphic Dark",
    ovThemeNeon: "Neon Cyber Synth",
    ovThemeMinimal: "Minimal Slate",
    ovThemeLight: "Clean Light",
    ovProgress: "Fortschrittsbalken",
    ovUrlLabel: "OBS Browser-Quellen URL",
    ovCopy: "URL kopieren",
    ovCopied: "Kopiert!",
    ovDirectLink: "Direktlink für OBS Studio oder Streamlabs Browser-Quelle",
    ovOpen: "Overlay öffnen",
    ovRecSettings: "Empfohlene OBS-Einstellungen",
    ovWidth: "Breite",
    ovHeight: "Höhe",
    ovFps: "FPS",
    ovCustomCss: "Benutzerdefiniertes CSS (bereits transparent):",
    ovCopyCss: "CSS kopieren",
    ovDesignerTitle: "Gestalte dein Now-Playing-Overlay",
    ovDesignerIntro: "Wähle Stil, Layout und sichtbare Informationen. Der OBS-Link aktualisiert sich automatisch.",
    ovReset: "Design zurücksetzen",
    ovChooseTheme: "Visuelles Theme",
    ovThemeOcean: "Ocean Pulse",
    ovThemeSunset: "Sunset Glow",
    ovThemeTwitch: "Twitch Purple",
    ovThemeMono: "Hoher Kontrast",
    ovLayout: "Layout",
    ovLayoutHorizontal: "Horizontal",
    ovLayoutHorizontalDesc: "Ausgewogener Banner für die meisten Szenen",
    ovLayoutCompact: "Kompakt",
    ovLayoutCompactDesc: "Flach und platzsparend über dem Gameplay",
    ovLayoutStacked: "Gestapelt",
    ovLayoutStackedDesc: "Großes Cover für musikbetonte Szenen",
    ovContent: "Inhalt und Größe",
    ovArtwork: "Albumcover",
    ovRequester: "Wünschende Person",
    ovTime: "Abspielzeit",
    ovAccent: "Akzentfarbe",
    ovScale: "Skalierung",
    ovRadius: "Eckenradius",
    ovPreviewBackground: "Vorschauhintergrund",
    ovBgTransparent: "Raster",
    ovBgDark: "Dunkel",
    ovBgLight: "Hell",
    ovReadyTitle: "Bereit für OBS",
    ovCopyFailed: "Kopieren nicht möglich. Markiere die URL und kopiere sie manuell.",
    overlayNowPlaying: "Läuft gerade",
    overlayPaused: "Pausiert",
    overlayRadio: "YouTube Music Radio",
    overlayRequestedBy: "Gewünscht von",
    
    // NowPlayingCard
    npTitle: "Läuft gerade",
    npEmptyTitle: "Kein Song wird aktuell abgespielt",
    npEmptyDesc: "Zuschauer können mit !sr <song> im Chat Songs wünschen, oder starte die Wiedergabe im gewählten Webplayer.",
    npModSkip: "Mod Überspringen",
    
    // Queue Roles
    qlRoleStreamer: "Streamer",
    qlRoleMod: "Mod",
    qlRoleVip: "VIP",
    qlRoleSub: "Sub",
    qlRoleViewer: "Zuschauer",
    qlUsername: "Benutzer",

    // QueueList
    qlTitle: "Warteschlange (FIFO)",
    qlAddManual: "Manuellen Songwunsch hinzufügen",
    qlPlaceholder: "Song suchen oder YouTube-/YTM-/Spotify-Link einfügen...",
    qlAddBtn: "Einreihen",
    qlEmptyTitle: "Warteschlange ist leer",
    qlEmptyDesc: "Zuschauer können mit !sr <song> im Chat Songs anfordern. Bis dahin kann der gewählte Player weiterlaufen.",
    qlClearBtn: "Warteschlange leeren",

    // ChatSimulator
    csTitle: "Twitch Chat & Befehlstester",
    csBadge: "Interaktiver Live Simulator",
    csTest: "Test",
    csEmpty: "Noch keine Chat- oder Bot-Logs. Tippe einen Befehl oder nutze die Test-Buttons!",
    csInputPlaceholder: "z.B. !sr Queen Bohemian Rhapsody, !sr <Spotify-Link>, !np, !voteskip",
    csSend: "Senden",

    // Other common
    maxDuration: "Max. Dauer",
    maxPerViewer: "Max / Viewer",
    voteSkip: "Vote-Skip",
    language: "Sprache"
    ,loadingBot: "Bot wird geladen…"
    ,apiUnavailable: "Bot nicht erreichbar."
    ,actionFailed: "Aktion fehlgeschlagen."
    ,playbackIdle: "Inaktiv"
    ,playbackPlaying: "LÄUFT"
    ,playbackRadio: "YTM-Autoplay-Radio aktiv"
    ,playbackVote: "Stimmen"
    ,playbackVoteButton: "+1 Stimme"
    ,playbackVoteHint: "Chat-Befehl !voteskip simulieren"
    ,playbackPlay: "Abspielen"
    ,playbackSkip: "Überspringen"
    ,connectionLost: "Verbindung zum Bot unterbrochen. Verbindung wird wiederhergestellt…"
    ,trackLoading: "Song wird geladen und der Start geprüft…"
    ,startNextRequest: "Nächsten Request starten / erneut versuchen"
    ,openObsOverlay: "OBS Overlay in neuem Tab öffnen"
    ,channelPointsReward: "Kanalpunkte: Songrequest-Reward-ID (leer = deaktiviert)"
    ,channelPointsTitle: "Songrequests über Twitch-Kanalpunkte"
    ,channelPointsDesc: "Aktiviere dies, damit Zuschauer eine Twitch-Kanalpunkte-Belohnung einlösen und den eingegebenen Song zur Warteschlange hinzufügen können."
    ,channelPointsEnable: "Kanalpunkte-Songrequests aktivieren"
    ,channelPointsSelect: "Kanalpunkte-Belohnung"
    ,channelPointsLoad: "Belohnungen laden"
    ,channelPointsLoading: "Belohnungen werden geladen…"
    ,channelPointsChoose: "Belohnung auswählen…"
    ,channelPointsNone: "Keine verfügbaren Belohnungen gefunden."
    ,channelPointsUnknown: "Aktuell konfigurierte Belohnung"
    ,channelPointsInputHint: "Tipp: Nutze eine Belohnung mit Texteingabe, damit der Bot den Songwunsch auslesen kann."
    ,channelPointsSaveFirst: "Trage Twitch-Kanal und Token ein. Beim Laden der Belohnungen werden sie automatisch gespeichert."
    ,channelPointsChooseRequired: "Kanalpunkte sind aktiviert. Wähle eine Belohnung aus, damit Einlösungen angenommen werden."
    ,twitchTokenStatus: "Twitch-Token:"
    ,tokenStoredHint: "gespeichert — leeres Feld behält ihn bei"
    ,tokenMissingHint: "noch nicht gespeichert"
    ,saveFailed: "Speichern fehlgeschlagen."
    ,launcherTitle: "Windows-Start"
    ,launcherIntro: "ZIP vollständig entpacken. Bei der Standalone-Version Portable öffnen und Start-Bot.vbs doppelklicken; Node.js ist enthalten. Nur die Quellcode-Version benötigt vorher Node.js 22+ und Installieren.bat. Einen Hintergrund-Bot mit Stop-Bot.bat beenden."
    ,launcherHelp: "Bei Problemen Start-Bot.bat öffnen oder data/bot-error.log prüfen. Den kompletten Ordner zusammenlassen; einzelne Startdateien reichen nicht aus."
    ,pairTitle: "YouTube Music Desktop verbinden"
    ,embeddedYtmTitle: "YouTube-Music-Webplayer"
    ,embeddedYtmConnected: "Webplayer verbunden"
    ,embeddedYtmDescription: "Der Bot steuert den integrierten YouTube-Music-Player direkt. Eine separate YTMDesktop-App oder ein Kopplungs-Token ist nicht erforderlich."
    ,pairAuthorized: "Verbunden und autorisiert"
    ,pairInstruction1: "YTMDesktop 2.x öffnen. Unter Integrationen den Begleitserver und das Autorisierungsfenster aktivieren."
    ,pairInstruction2: "„Neu koppeln“ wählen, Codes vergleichen und die Anfrage in YTMDesktop innerhalb von 30 Sekunden bestätigen."
    ,pairInstruction3: "Nur eine Bot-Instanz koppeln: Eine neue Kopplung ersetzt den alten Token."
    ,pairAgain: "Neu koppeln"
    ,pairCancel: "Abbrechen"
    ,pairReset: "Token zurücksetzen"
    ,done: "Erledigt."
    ,requestFailed: "Anfrage fehlgeschlagen."
    ,or: "oder"
    ,clickSuffix: "doppelklicken."
    ,overlayWaiting: "Warte auf die Wiedergabe von YouTube Music…"
    ,previousSong: "Vorheriger Song"
  }
};

export const useTranslations = (value: string) => {
  const lang: Language = value === 'en' ? 'en' : 'de';
  return (key: keyof typeof translations['en']): string => {
    return translations[lang]?.[key] || translations['en'][key] || key;
  };
};

// Server messages are kept as stable diagnostics, then rendered in the selected UI language.
// This also makes messages already present in state react immediately to a language switch.
const backendEnglish: Array<[RegExp, string]> = [
  [/^Bot nicht erreichbar\.$/, 'Bot is not reachable.'],
  [/^Aktion fehlgeschlagen\.$/, 'Action failed.'],
  [/^Speichern fehlgeschlagen\.$/, 'Could not save settings.'],
  [/^Eine Kopplung läuft bereits\. Bitte bestätigen oder abbrechen\.$/, 'Pairing is already in progress. Approve or cancel it first.'],
  [/^Kopplungscode wird angefordert…$/, 'Requesting pairing code…'],
  [/^Kopplung abgebrochen\.$/, 'Pairing cancelled.'],
  [/^Kein gültiger Kopplungscode empfangen\.$/, 'No valid pairing code was received.'],
  [/^Code vergleichen und in YouTube Music Desktop innerhalb von 30 Sekunden bestätigen\.$/, 'Compare the code and approve it in YouTube Music Desktop within 30 seconds.'],
  [/^Bitte in YouTube Music Desktop bestätigen\.$/, 'Please approve the request in YouTube Music Desktop.'],
  [/^Kopplung fehlgeschlagen\.$/, 'Pairing failed.'],
  [/^Kein gültiger Token empfangen\.$/, 'No valid token was received.'],
  [/^Gekoppelt: Token gespeichert und am Begleitserver erfolgreich geprüft\.$/, 'Paired: the token was saved and successfully verified with the Companion Server.'],
  [/^Autorisierung abgelehnt \(HTTP (\d+)\)\. Bitte neu koppeln\.$/, 'Authorization rejected (HTTP $1). Please pair again.'],
  [/^Begleitserver: Zu viele Anfragen\. Bitte kurz warten\.$/, 'Companion Server: too many requests. Please wait a moment.'],
  [/^Begleitserver meldet HTTP (\d+)\.$/, 'Companion Server returned HTTP $1.'],
  [/^Begleitserver nicht erreichbar oder Zeitüberschreitung\.$/, 'Companion Server is not reachable or the request timed out.'],
  [/^Ungültige Video-ID\.$/, 'Invalid video ID.'],
  [/^Verbindung und Autorisierung erfolgreich geprüft\.$/, 'Connection and authorization were verified successfully.'],
  [/^Begleitserver nicht erreichbar\. YTMDesktop, Begleitserver und eingestellte Adresse prüfen\.$/, 'Companion Server is not reachable. Check YTMDesktop, the Companion Server, and the configured address.'],
  [/^Wiedergabe fehlgeschlagen\. Request bleibt erhalten\.$/, 'Playback failed. The request remains in the queue.'],
  [/^Songstart nach 20 Sekunden nicht bestätigt\. Request bleibt erhalten; mit „Nächsten Request starten“ erneut versuchen\.$/, 'Track start was not confirmed within 20 seconds. The request remains in the queue; use “Start next request” to try again.'],
  [/^Request aus letzter Sitzung wiederhergestellt\. Mit „Nächsten Request starten“ fortsetzen\.$/, 'Request restored from the previous session. Continue with “Start next request”.'],
  [/^Daten konnten nicht gespeichert werden\. Schreibrechte im data-Ordner prüfen\.$/, 'Data could not be saved. Check write permissions for the data folder.'],
  [/^Songdauer konnte nicht zuverlässig ermittelt werden\.$/, 'The track duration could not be determined reliably.'],
  [/^Konfiguration konnte nicht gespeichert werden\. Schreibrechte im data-Ordner prüfen\.$/, 'Configuration could not be saved. Check write permissions for the data folder.']
];

export const localizeBackendMessage = (message: string | null | undefined, language: Language): string => {
  if (!message) return '';
  if (message === 'fetch failed' || message.includes('fetch failed')) {
    return language === 'de'
      ? 'Der YouTube-Music-Player ist nicht erreichbar. Prüfe, ob die Bot-App läuft und der lokale Player-Dienst auf Port 9863 erreichbar ist.'
      : 'The YouTube Music player is not reachable. Check that the bot app is running and the local player service on port 9863 is available.';
  }
  if (language !== 'en') return message;
  for (const [pattern, replacement] of backendEnglish) if (pattern.test(message)) return message.replace(pattern, replacement);
  return message;
};
