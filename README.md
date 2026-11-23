# DeEe Bot

<img src="public/favicon.svg" alt="" width="40">

DeEe Bot hilft Twitch-Streamern, Songwünsche zu verwalten, OBS-Szenen zu gestalten und den Chat direkt ins Streamgeschehen einzubinden.

**[Releases](https://github.com/DeEeLaBs/twitch-music-bot/releases) · [Schnellstart](#schnellstart) · [Funktionen](#funktionen)**

![Testansicht des OBS-Musikplayers mit kompaktem, horizontalem und gestapeltem Layout sowie Banner](docs/reports/waveform-layouts.png)

*Musikplayer-Layouts mit Beispieldaten aus der Projektvorschau.*

## Funktionen

### Musik und Songrequests

Ein Zuschauer wünscht sich per `!sr <Link>` einen Song. Du behältst im Dashboard die Warteschlange im Blick und kannst den laufenden Titel mit `!playlist` für deine Spotify-Playlist vormerken.
- Songwünsche per `!sr`, über das Dashboard oder Twitch-Kanalpunkte.
- Spotify- und YouTube-/YouTube-Music-Links werden unterstützt; bei dienstübergreifenden Links bleibt die Wiedergabe beim ausgewählten Player.
- Wiedergabe über Spotify Connect, YouTube Music Desktop (YTMDesktop Companion) oder NectarLink.
- Warteschlange mit Duplikatschutz, Cooldowns, Anfrage-Limits, Sperrlisten, Verlauf, Skip, Pause und Lautstärke-Steuerung.
- `!playlist` speichert Songs lokal und synchronisiert sie auf Wunsch mit der eingerichteten Spotify-Playlist; offene oder fehlgeschlagene Zuordnungen bleiben sichtbar und können erneut versucht werden.
- Albumcover, Song-Metadaten und Playerzustand werden für Dashboard und Overlays erfasst.

### OBS und Overlays

Gestalte ein Intro mit Countdown und eine Gameplay-Szene mit Musikplayer und Chat. Beide Overlays erhalten eine eigene OBS-Adresse und können gleichzeitig geladen sein.

- Alert-Designer für Ereignisse wie Follows, Subs und Bits.
- Mehrere unabhängige Overlays mit eigener OBS-Adresse und vollständigem Design.
- Visueller Overlay-Designer mit frei positionierbaren Widgets, Layouts, Themes, Farben, Cover, Fortschritt, Chat, Begrüßungen und Countdown.
- Musikplayer-Designs einschließlich **Ashen – Inventar**.
- Overlay-Ausgabe bleibt unabhängig von der im Designer ausgewählten Szene; mehrere Browserquellen können parallel verschiedene Overlays anzeigen.
- Zusätzliche OBS-Widgets für Chatspiele, Glücksrad und Begrüßungen.

### Chatspiele und Stream-Interaktionen

Starte zwischen zwei Matches ein Quiz. Zuschauer antworten im Chat, während OBS Frage und Ergebnis zeigt.
- **Quiz**, **Zahlenraten**, gemeinsames **Wort-/Galgenraten** und **Chat-Abenteuer**.
- Spielrunden können im Dashboard oder über Stream-Deck-Tasten gestartet und gesteuert werden.
- Punkte und Rangliste werden dauerhaft gespeichert; Quiz bietet Kategorien, Fragenkatalog und optionale Joker.
- Glücksrad mit eigenen Feldern und Farben, Steuerung im Dashboard und Anzeige als Overlay-Widget.
- Persönliche Zuschauer-Begrüßungen mit unabhängig aktivierbarem Sound, GIF und Chatnachricht.

### Stream steuern

Starte vor dem Stream den Countdown und lasse beim Subathon etwa ein Geschenk-Abo die Restzeit verlängern. Wiederkehrende Aktionen kannst du auf Stream-Deck-Tasten legen.

- Streamstart- und Subathon-Timer mit eigenen OBS-Links.
- Zeitboni und Aktionen für Twitch-Events sowie Spendenanbieter StreamElements, Streamlabs und TipeeeStream.
- Lokales Dashboard für Einrichtung, Diagnose und Chatbefehle sowie eine Windows-Desktop-App.
- Stream-Deck-Plugin **DeEe Bot** für Musik, Warteschlange, Timer und Chatspiele im aktuellen Quellcode.

## Schnellstart

### Windows-Download

Der zuletzt veröffentlichte [Windows-Release v1.10.0](https://github.com/DeEeLaBs/twitch-music-bot/releases/tag/v1.10.0) enthält unter anderem mehrere OBS-Overlays, persönliche Begrüßungen, Spotify-Playlist-Sync und dienstübergreifende Songlinks. Chatspiele, Glücksrad, NectarLink und die neuen Stream-Deck-Spieltasten gehören zum neueren Quellcode.

1. Lade `MusicBot-1.10.0-Windows-x64-Portable.zip` auf der Release-Seite herunter und entpacke das Archiv vollständig.
2. Starte `Portable/MusicBot.exe`. Node.js und Electron sind im Paket enthalten. Internet und die jeweiligen Dienstkonten sind erforderlich.
3. Verbinde Twitch und den gewünschten Musikdienst unter **Setup**. Für Spotify Connect brauchst du Spotify Premium und eine Spotify-Client-ID.
4. Kopiere im **Overlay-Designer** die OBS-URL des gewünschten Overlays und füge sie in OBS als **Browserquelle** hinzu.

Details zur Einrichtung und zur Datenübernahme stehen in der [Windows-Anleitung](docs/STANDALONE.md).

### Aktueller Quellcode (1.11.0)

1. Lade das Projekt als ZIP herunter und entpacke es vollständig in einen eigenen Ordner.
2. Installiere Node.js **22 oder neuer**.
3. Starte `Installieren.bat`, um Abhängigkeiten zu installieren und den Produktionsbuild zu erstellen.
4. Öffne den Bot mit `MusicBot starten.cmd`. Das lokale Dashboard ist unter <http://127.0.0.1:3000> erreichbar.
5. Verbinde Twitch und den gewünschten Musikdienst im Setup und führe anschließend die Diagnose aus.

YouTube Music kann über den eingebetteten Player laufen. Für die separate YTMDesktop-Anbindung brauchst du **YTMDesktop 2.x mit Companion API v1**.

## Anleitungen

- [Mehrere OBS-Overlays](docs/MULTI_OVERLAYS.md) und [persönliche Begrüßungen](docs/GREETINGS.md)
- [Dienstübergreifende Songlinks](docs/CROSS_SERVICE_REQUESTS.md) und [Spotify-Playlist](docs/SPOTIFY_STREAM_PLAYLIST.md)
- [Chatspiele](docs/CHAT-GAMES.md), [Glücksrad](docs/WHEEL.md) und [Countdown und Subathon](docs/COUNTDOWN.md)
- [Stream-Deck-Plugin](streamdeck-plugin/README.md)

## Chatbefehle

| Befehl | Zugriff | Funktion |
|---|---|---|
| `!sr <Titel oder Link>` | alle | Song zur Warteschlange hinzufügen |
| `!np`, `!song` | alle | aktuell laufenden Song anzeigen |
| `!queue` | alle | Warteschlange anzeigen |
| `!playlist` | alle, gemäß Konfiguration | Song für die Spotify-Playlist vormerken/synchronisieren |
| `!play <Antwort>` | alle während einer Spielrunde | beim aktiven Chatspiel mitspielen |
| `!points`, `!points top` | alle | Spielpunkte und Rangliste anzeigen |
| `!skip`, `!pause`, `!resume`, `!vol <0–100>` | Mods/Streamer | Wiedergabe steuern |
| `!veto <Position oder Titel>`, `!clearqueue` | Mods/Streamer | Queue moderieren |
| `!blacklist add/remove <Begriff>` | Mods/Streamer | Songfilter verwalten |

Konkrete Berechtigungen, Aliase, Cooldowns und Limits sind im Dashboard konfigurierbar. Die Spielstartbefehle für Mods sind im Bereich „Commands“ aufgeführt.

## Daten und Sicherheit

Der Server bindet standardmäßig nur an `127.0.0.1`; das Dashboard ist lokal erreichbar. Ändernde API-Aufrufe benötigen eine lokale Sitzung. Zugriffstokens werden getrennt von der normalen Konfiguration gespeichert und unter Windows mit DPAPI geschützt. Nutzdaten wie Warteschlange, Spieleinstellungen und Overlays liegen lokal im Ordner `data`; sichere diesen Ordner vor manuellen Updates.

Der Bot lädt keine Musik herunter und umgeht keine Zugriffsbeschränkungen der Anbieter. Externe Dienste können APIs, Metadaten oder Verfügbarkeit ändern; Diagnose und Fehlermeldungen zeigen solche Ausfälle an.

## Entwicklung und Prüfung

Voraussetzung: Node.js 22+.

```sh
npm ci
npm run lint
npm test
npm run build
npm run test:smoke
```

`npm run dev` startet den Entwicklungsserver mit Hot Reload. Stream-Deck-Plugin bauen und bereitstellen: `npm run streamdeck:pack`. Weitere Anleitungen stehen in [`docs/`](docs/) und [`streamdeck-plugin/README.md`](streamdeck-plugin/README.md).

## Projektstand

Der Quellcode und die Funktionen sind in aktiver Entwicklung. Verbindungen zu Twitch, Spotify, YouTube Music, NectarLink, OBS und Stream Deck sollten vor einem Livestream lokal mit den eigenen Konten und Geräten getestet werden.
