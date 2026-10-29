# Twitch / YouTube Music Song Request Bot — Version 1.6.0

Lokales Dashboard, Twitch-Chatbefehle, Songrequest-Warteschlange und OBS-Overlay.
Ziel: **YouTube Music Desktop App (YTMDesktop) 2.x, Companion API v1**.
Andere Desktop-Apps mit ähnlichem Namen und Legacy-YTMDesktop 1.x werden nicht unterstützt.

## Spotify Premium + Spotify-Track-Links

Spotify kann jetzt auf zwei Arten genutzt werden: ohne Premium weiterhin als reine Request-Quelle mit YouTube-Music-Fallback, oder mit Premium über die offizielle Spotify-OAuth-/Spotify-Connect-Anbindung. Für Premium wird **kein Client Secret** im Bot benötigt; die Anmeldung nutzt Authorization Code mit PKCE. Trage die Spotify Client ID im Setup ein und registriere `http://127.0.0.1:3000/auth/spotify/callback` als Redirect URI. Der optionale lokale `/spotify/player` nutzt den offiziellen Web Playback SDK und registriert sich als Spotify-Connect-Gerät.

Unterstützt werden einzelne Spotify-Track-Links und `spotify:track:...`-URIs. Ist Spotify Premium verbunden und die direkte Spotify-Wiedergabe aktiviert, spielt der Bot diese Requests über ein ausgewähltes Spotify-Connect-Gerät. Ist Spotify nicht verfügbar oder der Fallback aktiviert, wird derselbe Request weiterhin zu YouTube Music aufgelöst. Playlist-/Album-Links werden nicht automatisch als mehrere Requests importiert.

## Windows: erster Start

1. Node.js **22 oder neuer** installieren (https://nodejs.org/).
2. Diese ZIP vollständig in einen eigenen Ordner entpacken. Nicht aus der ZIP starten.
3. `Installieren.bat` doppelklicken. Sie installiert die Abhängigkeiten anhand der Lockdatei und erstellt den Produktionsbuild. Internet erforderlich.
4. YTMDesktop öffnen und dort eine normale Musikwiedergabe prüfen.
5. `Start-Bot.vbs` doppelklicken. Dashboard: **http://127.0.0.1:3000**.
6. In den Bot-Einstellungen Twitch-Kanal, Bot-Benutzername und Twitch-Chat-OAuth-Token speichern.
7. YTMDesktop: unter Integrationen den Begleitserver und das zeitweilige Autorisierungsfenster aktivieren.
8. Im Bot „Neu koppeln“ wählen, Codes vergleichen und in YTMDesktop innerhalb von 30 Sekunden bestätigen. Der Bot speichert und prüft den Token automatisch.
9. „Diagnose ausführen“ muss eine gültige Autorisierung melden. Danach einen kurzen YouTube-Link anfragen.

Die Autorisierung bleibt erforderlich. Das zeitweilige Autorisierungsfenster ist **kein Schalter für einen offenen, tokenlosen Betrieb**.
Eine weitere Kopplung mit derselben App-ID ersetzt den bisherigen Token. Deshalb nur eine Bot-Instanz koppeln. Ein normaler Neustart ist für sich allein kein Beleg für Tokenablauf.

## Bereits vorhandene Installation übernehmen

Alten Bot zuerst beenden. Den bisherigen `data`-Ordner sichern und in den neu entpackten Ordner kopieren; optional auch die `.env` übernehmen. Nicht die alten Quelldateien über die neuen kopieren.
`data/bot-config.json` hat Vorrang vor `.env`. Ein ungültiger YTM-Token kann mit „Token zurücksetzen“ gelöscht und neu gekoppelt werden.
Die alte Queue-Datei (Arrayformat) wird gelesen und beim Speichern auf ein Format mit laufendem Request und Verlauf umgestellt. Die Sicherung für einen Rückwechsel behalten.

## Start, Stop und OBS

- `Start-Bot.vbs`: Hintergrundstart mit Bereitschaftsprüfung, öffnet Browser.
- `Start-Bot.bat`: sichtbarer Start für Fehlersuche; Strg+C beendet den Terminalbetrieb.
- `Stop-Bot.bat`: beendet nur den vom Hintergrundlauncher erfassten, passenden Node-Prozess.
- `Autostart-Einrichten.bat` / `Autostart-Entfernen.bat`: Windows-Autostart verwalten.
- Hintergrund-Startprotokolle: `data/bot.log`, `data/bot-error.log`.
- OBS-Browserquelle: Im **Overlay-Designer** Theme, Layout und Inhalte auswählen, dann die erzeugte URL kopieren. Die empfohlenen Abmessungen werden passend zum Layout angezeigt.
- Alternative: **http://127.0.0.1:3000/overlay/standalone**.
- Port 3000 ist fest. Der Bot ist nur auf dem eigenen Rechner erreichbar.

## Dashboard und Overlay-Designer

Das Dashboard ist für Desktop, Tablet und Smartphone responsiv. Die Hauptnavigation lässt sich mit Tab sowie den Pfeiltasten bedienen; sichtbare Fokusmarkierungen, Statusmeldungen für Screenreader, größere Klickflächen, ein Sprunglink und reduzierte Animationen sind eingebaut.

Der OBS-Designer enthält acht Themes (**Glass, Neon, Minimal, Light, Ocean, Sunset, Twitch und Hoher Kontrast**) sowie drei Layouts (**Horizontal, Kompakt und Gestapelt**). Cover, Fortschritt, wünschende Person und Zeit lassen sich einzeln ein- oder ausblenden. Akzentfarbe, Skalierung und Eckenradius sind einstellbar und werden in der OBS-URL gespeichert. Die zuletzt gewählten Optionen bleiben im Browser erhalten.

Alle Skripte müssen im vollständigen Projektordner bleiben. Der Launcher ist für Windows; der Node-Server kann auch auf anderen Plattformen laufen.

## Chatbefehle

| Befehl | Berechtigung |
| --- | --- |
| `!sr <Titel, YouTube- oder Spotify-Track-Link>` / `!songrequest` | alle |
| `!np`, `!song`, `!current` | alle |
| `!queue`, `!voteskip`, `!help` | alle |
| `!skip`, `!veto <Position oder Titel>`, `!clearqueue` | Mod / Streamer |
| `!pause`, `!resume`, `!vol 0` bis `!vol 100` | Mod / Streamer |
| `!blacklist add <Begriff>`, `!blacklist remove <Begriff>` | Mod / Streamer |

Kanalpunkte sind standardmäßig deaktiviert. Nach Eingabe der Twitch-Daten kann der Bot die vorhandenen Rewards automatisch laden. Mit einem Token mit `channel:manage:redemptions` kann er auf Wunsch auch eine passende Songrequest-Belohnung erstellen. Der ausgewählte Reward wird regelmäßig validiert; gelöschte, deaktivierte oder falsch konfigurierte Rewards erscheinen in der Diagnose. Diese Version verarbeitet über Twitch-Chat übermittelte Einlösungen mit Texteingabe. Eine automatische Rückerstattung von Kanalpunkten ist nicht enthalten.

Requests haben standardmäßig maximal sieben Minuten und mindestens 20 Sekunden; maximal zwei aktive Requests je Zuschauer einschließlich laufendem Song. Moderatoren sind vom persönlichen Limit ausgenommen. Queue-Größe, Mindestdauer, Wiederholungsfenster, Benutzer-/Global-Cooldown sowie Berechtigungen und Cooldowns einzelner Befehle sind in den Einstellungen konfigurierbar. Zuschauer können für Requests gesperrt und ihre offenen Requests gesammelt entfernt werden.

## Verhalten bei Fehlern

- Ein Request wird erst nach passender Player-ID und bestätigter Wiedergabe als gestartet übernommen.
- Bei nicht bestätigtem Start bleibt der Request erhalten. Dashboard zeigt den Fehler. Mit „Nächsten Request starten / erneut versuchen“ erneut starten oder Song aus der Queue entfernen.
- Requests werden bei Fehlern nicht endlos automatisch wiederholt.
- Bei Neustart wird ein weiterhin passender Player-Song dem bisherigen Anfragenden zugeordnet. Hat der Player gewechselt, bleibt der alte Request zur manuellen Fortsetzung erhalten.
- Simulation ist ausschließlich ein ausdrücklich eingeschalteter Testmodus und ersetzt keine fehlgeschlagene echte Verbindung.
- Dashboard und Overlay verbinden sich nach Abbrüchen automatisch neu.
- Zugriffstokens stehen nicht mehr im normalen `bot-config.json`. Unter Windows werden sie benutzergebunden mit DPAPI verschlüsselt in `data/secrets.json` gespeichert; auf anderen Plattformen nutzt der Bot eine lokale AES-GCM-Schlüsseldatei. Tokens werden nicht an Dashboard/OBS oder Diagnoseantworten übertragen. Leere Tokenfelder behalten den vorhandenen Wert bei.
- Vor atomaren JSON-Updates wird eine `.backup`-Datei angelegt. Eine beschädigte Hauptkonfiguration kann beim Start aus dem Backup wiederhergestellt werden.
- Ändernde REST-Aufrufe benötigen zusätzlich eine lokale Sitzungskennung; `/api/v1/...` ist die versionierte API, `/api/...` bleibt kompatibel.

## Grenzen und lokale Abschlussprüfung

Bei Textanfragen sucht der Bot zuerst gezielt in YouTube Music nach einem Treffer aus der Kategorie „Songs/Titel“. Nur wenn dort kein brauchbarer Song gefunden wird, verwendet er die normale YouTube-Videosuche als Fallback. Videodauer und Metadaten werden weiterhin aus öffentlichen YouTube-/YouTube-Music-Antworten gelesen. YouTube kann diese Antworten ändern oder Zugriffe blockieren. Dann wird eine Fehlermeldung statt eines erfundenen Songs geliefert. Direkte Links sind ebenfalls auf abrufbare Metadaten angewiesen. Blacklist prüft Metadaten, nicht den Audioinhalt.

Autoplay verwendet die bereits vorhandene YTM-Wiedergabe; der Bot erzeugt keine eigene Radio-Playlist. Bei deaktiviertem Autoplay wird nach einem Request-Ende pausiert. Werbung und YTM-Ladeverzögerungen können Starts verzögern.

Vor dem ersten Livestream lokal prüfen: koppeln → Diagnose → zwei kurze Requests → Pause/Resume → Lautstärke 0 → Vote-Skip → Bot-Neustart → OBS-Reconnect. Windows-Launcher und echte Twitch-/YTM-Verbindungen konnten in der Entwicklungsumgebung nicht Ende zu Ende getestet werden.

## Erweiterte Funktionen ab 1.4.0

- **Song-Suche:** YouTube Music bleibt erste Quelle. Treffer werden nach Titel/Künstler gewichtet; Live-, Cover-, Karaoke-, Remix-, Sped-up- und ähnliche Varianten werden bei normalen Anfragen abgewertet. Erfolgreiche Treffer werden optional persistent gecacht, fehlgeschlagene Suchen kurz negativ gecacht und identische parallele Suchen zusammengefasst. Circuit Breaker verhindern aggressives Wiederholen bei externen Ausfällen.
- **Warteschlange:** Drag & Drop plus tastaturbedienbare Hoch/Runter-Schaltflächen, Gesamtlimit, Mindestdauer, Wiederholungsfenster und Requester-Verwaltung.
- **OBS:** Presets können angewendet, als JSON exportiert und wieder importiert werden. `/overlay/standalone` verwendet dieselbe Overlay-Implementierung wie `/overlay`, damit kein doppelter Overlay-Code auseinanderläuft.
- **Diagnose:** Systemstatus für Twitch, YTM, Suche, Secrets, Persistenz, Channel Points und lokale Plugins. Der Diagnoseexport enthält absichtlich keine Zugriffstokens. Strukturierte Logs rotieren bei ca. 5 MB.
- **WebSocket:** Heartbeat entfernt tote Browser-/OBS-Verbindungen; Queue-Änderungen werden getrennt von anderen State-Patches übertragen.
- **Plugins:** Der Ordner `plugins/` enthält ein bewusst kleines lokales Plugin-Grundgerüst. Nur selbst geprüfte lokale Plugins verwenden – Plugin-Code läuft mit den Rechten des Bots.
- **Frontend:** Fehlergrenze verhindert bei einem Komponentenfehler eine vollständig weiße Oberfläche; größere Bereiche werden lazy geladen.

## Entwicklung und Tests

```sh
npm ci
npm run lint
npm test
npm run build
npm run test:smoke
npm start
```

`npm run dev` startet den Entwicklungsserver. `npm start` verwendet den Produktionsbuild. Nach Quellcodeänderungen erneut bauen.
`npm run desktop` (und `MusicBot starten.cmd`) startet den Produktionsbuild und baut nur bei geänderten Quellen neu (ca. 5 s); `npm run desktop:dev` startet stattdessen den Entwicklungsserver mit Hot-Reload.
Die Tests verwenden kontrollierte Player-/HTTP-Antworten für Autorisierung, Queue-Übergänge, Suche und Fehlerfälle; sie sind kein Ersatz für den lokalen Test mit den echten Apps.

API-Referenz: https://github.com/ytmdesktop/ytmdesktop/wiki/v2-%E2%80%90-Companion-Server-API-v1

## Twitch-Kanalpunkte-Songrequests

In **Setup & Einstellungen** kann die Funktion **Songrequests über Twitch-Kanalpunkte** aktiviert werden. Nach dem Speichern von Twitch-Kanal und OAuth-Token lädt der Bot die verfügbaren Kanalpunkte-Belohnungen automatisch und zeigt sie in einer Auswahlliste an. Eine manuelle Reward-ID ist nicht mehr nötig.

Der verwendete Twitch-Token muss zum Broadcaster-Konto gehören und zusätzlich zu `chat:read` und `chat:edit` die Berechtigung `channel:read:redemptions` enthalten. Für Songwünsche sollte die ausgewählte Belohnung die Texteingabe durch Zuschauer verlangen.


## Hinweis zu v1.4.2
Neue Twitch- und YouTube-Music-Tokens werden ohne PowerShell-/ProtectedData-Abhängigkeit mit AES-256-GCM gespeichert. Bei einem Update bitte `Installieren.bat` einmal ausführen; dabei wird ein alter Produktions-Build entfernt und neu erstellt.

## Hinweis zu v1.4.3
Der YTM-Status in der Kopfzeile wird jetzt über echte Verbindungsereignisse synchronisiert. Nach erfolgreichem Pairing bzw. erfolgreicher Zustandsabfrage wechselt der Chip sofort auf „Verbunden“; bei einer Trennung wieder auf „Nicht verbunden“.


## Overlay Studio v1.6.0
Der Editor unterstützt Profile, freie Positionierung per Drag & Drop, eigene Hintergrundbilder/Logos, Requester-Avatar/Badges und optionales Custom CSS. Hochgeladene Bilder werden lokal in `data/overlay-assets` gespeichert.

## Architektur ab v1.7.0

Die API ist in kleinere Router aufgeteilt (`src/server/routes`), Twitch-Command-Metadaten und Chat-Übersetzungen liegen zentral in `commandRegistry.ts` und `twitchMessages.ts`, und die Frontend-State/WebSocket-Logik befindet sich in `src/hooks/useBotState.ts`. Der YTM-Companion besitzt zusätzlich einen zentralen Command-Scheduler, der parallele Steuerbefehle serialisiert und schnelle Lautstärkeänderungen zusammenführt.

## Spotify-Wiedergabe

Die Spotify-Anmeldung erfolgt im Setup per OAuth. Bei ausgewähltem Spotify-Player laufen Songrequests über Spotify Connect beziehungsweise den eingebetteten Spotify-Webplayer. Der frühere separate Spotify-SDK-Tab wird nicht mehr verwendet.

## Startverhalten ab v1.8.4
`MusicBot starten.cmd` ist der zentrale Einstiegspunkt. Der Starter prüft bzw. startet zuerst den lokalen Server auf `127.0.0.1:3000`, wartet auf `/api/health` und öffnet erst danach die Desktop-Oberfläche. Das Dashboard ist die Standardansicht; YouTube Music und Spotify werden im Web-Player-Bereich entsprechend der aktiven Player-Auswahl angezeigt.

Bei einem fehlgeschlagenen Start stehen die Prozessausgaben unter `data/server-stderr.log` und `data/server-stdout.log`.

## Stream Deck
Das Setup enthält die Karte **Elgato Stream Deck**: Ein Klick öffnet das mitgelieferte Plugin in der Stream-Deck-App (diese fragt nach der Bestätigung); bei einer neueren Plugin-Version erscheint „Update verfügbar“. Das Plugin wird mit `npm run streamdeck:pack` bzw. automatisch von `npm run build:standalone` gebaut. Details: `streamdeck-plugin/README.md`.
