# DeEe Bot

Ein lokaler Twitch-Musikbot mit Dashboard, Songrequest-Warteschlange, OBS-Overlays und interaktiven Chatspielen. Der Bot läuft auf deinem Rechner und verbindet Twitch mit Spotify, YouTube Music oder NectarLink.

> Aktuelle Projektversion: **1.11.0** · [GitHub-Repository](https://github.com/DeEeLaBs/twitch-music-bot)

## Funktionen

### Musik und Songrequests
- Songwünsche per `!sr`, über das Dashboard oder Twitch-Kanalpunkte.
- Spotify- und YouTube-/YouTube-Music-Links werden unterstützt; bei dienstübergreifenden Links bleibt die Wiedergabe beim ausgewählten Player.
- Wiedergabe über Spotify Connect, YouTube Music Desktop (YTMDesktop Companion) oder NectarLink.
- Warteschlange mit Duplikatschutz, Cooldowns, Anfrage-Limits, Sperrlisten, Verlauf, Skip, Pause und Lautstärke-Steuerung.
- `!playlist` speichert Songs lokal und synchronisiert sie auf Wunsch mit der eingerichteten Spotify-Playlist; offene oder fehlgeschlagene Zuordnungen bleiben sichtbar und können erneut versucht werden.
- Albumcover, Song-Metadaten und Playerzustand werden für Dashboard und Overlays erfasst.

### Dashboard und Desktop-App
- Lokales Dashboard mit Setup, Diagnose, Chat- und Befehlsverwaltung.
- Electron-Desktop-App für Windows mit integriertem Hauptfenster und Neustartsteuerung.
- Stream-Deck-Plugin **DeEe Bot** mit Musik-, Queue-, Countdown- und Chatspiel-Aktionen.

### OBS und Overlays
- Mehrere unabhängige Overlays mit eigener OBS-Adresse und vollständigem Design.
- Visueller Overlay-Designer mit frei positionierbaren Widgets, Layouts, Themes, Farben, Cover, Fortschritt, Chat, Begrüßungen und Countdown.
- Musikplayer-Designs einschließlich **Ashen – Inventar**.
- Overlay-Ausgabe bleibt unabhängig von der im Designer ausgewählten Szene; mehrere Browserquellen können parallel verschiedene Overlays anzeigen.
- Zusätzliche OBS-Widgets für Chatspiele, Glücksrad und Begrüßungen.

### Chatspiele und Stream-Interaktionen
- **Quiz**, **Zahlenraten**, gemeinsames **Wort-/Galgenraten** und **Chat-Abenteuer**.
- Spielrunden können im Dashboard oder über Stream-Deck-Tasten gestartet und gesteuert werden.
- Punkte und Rangliste werden dauerhaft gespeichert; Quiz bietet Kategorien, Fragenkatalog und optionale Joker.
- Glücksrad mit eigenen Feldern und Farben, Steuerung im Dashboard und Anzeige als Overlay-Widget.
- Persönliche Zuschauer-Begrüßungen mit unabhängig aktivierbarem Sound, GIF und Chatnachricht.

### Countdown und Subathon
- Streamstart- und Subathon-Timer mit eigenen OBS-Links.
- Zeitboni und Aktionen für Twitch-Events sowie Spendenanbieter StreamElements, Streamlabs und TipeeeStream.

## Schnellstart unter Windows

1. Lade das Projekt als ZIP herunter und entpacke es vollständig in einen eigenen Ordner.
2. Installiere Node.js **22 oder neuer**.
3. Starte `Installieren.bat`, um Abhängigkeiten zu installieren und den Produktionsbuild zu erstellen.
4. Öffne den Bot mit `Start-Bot.vbs` oder `MusicBot starten.cmd`. Das lokale Dashboard ist unter <http://127.0.0.1:3000> erreichbar.
5. Verbinde Twitch und den gewünschten Musikdienst im Setup und führe anschließend die Diagnose aus.

Für YouTube Music wird **YTMDesktop 2.x mit Companion API v1** benötigt. Ältere YTMDesktop-1.x-Versionen werden nicht unterstützt. Für Spotify-Wiedergabe wird ein Spotify-Premium-Konto mit Spotify Connect benötigt; Spotify-Links können auch als Requestquelle mit YouTube-Music-Wiedergabe genutzt werden.

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
