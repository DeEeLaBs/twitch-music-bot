# Twitch Music Bot – Compact Architecture & Index Map
> **Zweck:** Dient als ultra-token-effiziente Referenzkarte für KI-Agenten und Entwickler. Vor dem Lesen ganzer Verzeichnisse immer zuerst diesen Index konsultieren.

---

## 1. Stack & Runtime
- **Frontend:** React 19, TypeScript (~5.8), Vite 6, Tailwind CSS v4, Lucide Icons
- **Backend:** Node.js (>=22, native `--experimental-strip-types`), Express 4, WebSockets (`ws`), `esbuild`, `tsx`
- **Desktop:** Electron (`desktop/main.cjs`, `desktop/drm.cjs`, `desktop/localRestart.cjs`, `desktop/windowChrome.cjs`)
- **Integrationen:** Twitch (EventSub / IRC / Channel Points / OAuth), Spotify (Web Playback SDK / API), YouTube / YTM (Companion WebSocket), Stream Deck (Plugin in `streamdeck-plugin/`), OBS (Overlays via Browser Source)

---

## 2. Wichtige Befehle
- `npm run dev` : Server & Hot-Reload (`server.ts` via `tsx watch`)
- `npm run build` : Vite Frontend + esbuild CJS Server Bundle (`dist/server.cjs`)
- `npm run build:standalone` : Packt Standalone-Version mit portablem Node & Skripten
- `npm test` : Test-Suite mit Node Native Testrunner (`node --experimental-strip-types --test tests/*.test.ts`)
- `npm run desktop` : Startet die Desktop-/Electron-Applikation

---

## 3. Modul- & Verzeichnis-Map

### `src/server/` (Backend Core & Services)
| Datei / Modul | Verantwortung / Kernfunktion |
| :--- | :--- |
| `server.ts` (Root) | Haupteinstiegspunkt, Initialisierung HTTP/WS/Express Server |
| `apiRouter.ts` & `routes/` | REST Endpoints für UI, OBS, Overlays & Webhooks |
| `botService.ts` | Twitch Bot Orchestrierung (Commands, Listeners, State) |
| `twitchBot.ts` / `twitchIrc.ts` | IRC Client, Chat-Parsing und Chat-Antworten |
| `twitchOAuthService.ts` | Twitch Token Exchange, Scopes, Token Refresh |
| `eventSubClient.ts` | Twitch EventSub WebSocket (Follows, Subs, Channel Points) |
| `channelPointsService.ts` | Einlösung von Kanalpunkten, Songwünsche & Refunds |
| `queueManager.ts` | Warteschlangen-Logik (Priorität, Blacklists, Duplikatscheck) |
| `queuePersistence.ts` | Speicherung der Queue auf Festplatte (`data/queue.json`) |
| `playbackResolver.ts` | Song-Erkennung, Provider-Routing (Spotify vs. YouTube) |
| `playbackPoll.ts` | Polling für aktuellen Wiedergabestatus |
| `playerPlugins/` | Provider-Plugins für Spotify, YouTube, Soundcloud etc. |
| `spotifyService.ts` | Spotify API Wrapper, Search & Playback State |
| `youtubeResolver.ts` | YouTube Such- & Extraktions-Helper |
| `ytmCompanion.ts` | WebSocket Bridge zum YouTube Music Desktop Companion |
| `gameService.ts` / `gameChat.ts` | Chat-Games (Trivia, Glücksrad, Emote-Fire) |
| `wheelService.ts` | Glücksrad-Logik & Belohnungen |
| `alertService.ts` | Benachrichtigungen / Stream-Alerts (Follower, Subs, Bits) |
| `greetingService.ts` | Automatisierte Begrüßungs-Nachrichten & Audio-Jingles |
| `streamDeckService.ts` | Lokale WebSocket/HTTP API für Elgato Stream Deck |
| `secureTokenStore.ts` | Gesicherte Speicherung von API-Tokens & Secrets |
| `atomicStore.ts` | Threadsichere / atomare Dateispeicherung für Konfigurationen |
| `logger.ts` | Rotierendes und gefiltertes Datei-Logging |

### `src/components/` (Frontend UI & React-Views)
| Komponente / Bereich | Funktion |
| :--- | :--- |
| `App.tsx` | Hauptlayout, Tab-Navigation, Drawer & globaler State |
| `NowPlayingCard.tsx` | Anzeige des aktuell laufenden Tracks mit Controls & Fortschritt |
| `QueueList.tsx` | Verwaltung der aktuellen Song-Warteschlange (Verschieben, Löschen) |
| `SpotifyBrowserPlayer.tsx` | Embedded Spotify Web Playback SDK Player |
| `ObsOverlayPage.tsx` | Browser-Source Overlay für OBS (Song-Anzeige, Covers, Waveform) |
| `OverlayStudio.tsx` & `OverlayEditor.tsx` | Visueller Editor für individuelle OBS-Overlays |
| `AlertObsPage.tsx` & `alert-creator/` | OBS Alert-Box & visueller Alert-Designer |
| `GamesStudio.tsx` & `GamesWidget.tsx` | Steuerung und Ansicht für interaktive Chat-Minispiele |
| `GreetingStudio.tsx` | Konfiguration von Viewer-Begrüßungen und Sounds |
| `WheelStudio.tsx` & `WheelWidget.tsx` | Konfiguration und Visualisierung des Glücksrads |
| `ChannelPointsSettings.tsx` | Zuordnung von Twitch Belohnungs-IDs zu Bot-Aktionen |
| `CommandRulesStudio.tsx` | Verwaltung von Chat-Befehlen, Berechtigungen und Cooldowns |
| `StreamDeckSetupCard.tsx` | Verbindungs- und Tasten-Assistent für Stream Deck |
| `DiagnosticsPanel.tsx` | Statusübersicht: Twitch-Verbindung, Spotify-Token, Port-Checks |

### `desktop/` (Electron Desktop Wrapper)
| Datei | Funktion |
| :--- | :--- |
| `main.cjs` | Electron Main-Process, Fensterverwaltung, Tray-Icon, App Lifecycle |
| `drm.cjs` | Widevine / DRM Support für Spotify Web Playback im Desktop-Fenster |
| `localRestart.cjs` | Automatischer Neustart-Mechanismus des lokalen Servers |
| `windowChrome.cjs` | Custom Window-Frameless Header & Drag-Areas |

### `streamdeck-plugin/` (Elgato Stream Deck Plugin)
- Eigenständiges Plugin-Paket (`com.chocdeee.musicbot.sdPlugin`) mit Aktionen für Play/Pause, Skip, Like, Queue-Status.

---

## 4. Richtlinien für effizientes Arbeiten
1. **Kein unnötiges File-Dumping:** Nicht ganze Ordner oder riesige Logfiles auslesen.
2. **Gezielte Pfade:** Vor Code-Änderungen nur die spezifischen Dateien aus obiger Tabelle heranziehen.
3. **Tests vorab ausführen:** Vor und nach Refactorings `npm test` oder spezifische Tests (`node --test tests/<name>.test.ts`) nutzen.
4. **Keine Secrets loggen:** Niemals unmaskierte Tokens aus `data/` oder `.env` in Logs oder Artefakte schreiben.
