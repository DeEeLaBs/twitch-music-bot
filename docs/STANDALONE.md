# MusicBot Standalone fuer Windows (64 Bit)

Die Portable-Version enthaelt Node.js, die Desktop-Oberflaeche, den integrierten
Spotify-/YouTube-Music-Webplayer und alle Programmabhaengigkeiten. Node.js, npm,
Electron und YouTube Music Desktop muessen nicht separat installiert werden.
Internet und die jeweiligen Twitch-/Musikdienst-Konten bleiben erforderlich.
Spotify-Steuerung benoetigt wie bisher Spotify Premium und die Client-ID.
DRM-Komponenten werden vom mitgelieferten Runtime beim ersten Online-Start geladen.
Google-Anmeldung verwendet den auf Windows vorhandenen Edge bzw. Chrome.

## Start

1. ZIP vollstaendig in einen beschreibbaren Ordner entpacken, z.B. Dokumente/MusicBot.
2. Eine bisher laufende Bot-Version beenden (Ports 3000 und 9863).
3. MusicBot.exe doppelklicken. Alternativ Start-MusicBot.bat verwenden.
4. Konten in den Einstellungen anmelden. Beim Schliessen des Fensters endet auch
   der mitgestartete Botserver.

Den gesamten Ordner zusammen behalten. Die EXE allein reicht nicht.
Dashboard: http://127.0.0.1:3000
OBS-Overlay: http://127.0.0.1:3000/overlay
OBS-Dock: http://127.0.0.1:3000/dock/player

## Einstellungen und Anmeldungen

Das Paket enthaelt keine persoenlichen Zugangsdaten. Alle Bot-Einstellungen
werden im Unterordner data gespeichert; Webplayer-Anmeldungen in data/browser-profile.
Fuer die Uebernahme von Bot-Einstellungen beide Versionen beenden, den bisherigen
data-Ordner sichern und dessen Konfigurations-/Speicherdateien nach Portable/data
kopieren. secrets.json und .secret-key gehoeren zusammen. PID- und Logdateien
nicht uebernehmen. Bereits verlorene Erneuerungstokens erfordern eine neue Anmeldung.
Eine Dateiuebernahme ersetzt keine Anmeldung in einem neuen Webplayer-Profil.

## Fehler und Entwicklung

Startfehler stehen in data/server-stderr.log; Desktopfehler in data/electron-crash.log.
Der Quellcode-Snapshot neben Portable bleibt separat bearbeitbar und wird zum
Benutzen nicht benoetigt. Entwickler bauen mit npm run build:standalone neu.
Der Build verwendet die im Entwicklungsprojekt installierte Desktop-Laufzeit
und benoetigt Internet zum Abruf der Node-Lizenz. Alte Pakete werden nicht ueberschrieben.
