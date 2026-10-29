# Testbericht v1.8.4

## Anlass
Nach v1.8.3 startete der Hauptstarter weiterhin ausschließlich den alten Desktop-Prototyp. Der lokale Bot-Server wurde dabei nicht gestartet, obwohl Dashboard, Spotify-Premium-Tab und API den Server benötigen. Dadurch konnte die Anwendung wie ein Startfehler bzw. eine nicht erreichbare Oberfläche wirken.

## Korrekturen
- Hauptstarter startet jetzt zuerst den lokalen Server und wartet auf `/api/health`.
- Desktop-Fenster wird erst nach erfolgreichem Health-Check geöffnet.
- Dashboard ist die erste Ansicht.
- YouTube Music bleibt als Desktop-Player erhalten.
- Alte eingebettete Spotify-Prototypfunktionen wurden entfernt, weil Spotify Premium bereits im Dashboard integriert ist.
- Doppelte/inkonsistente Starter wurden vereinheitlicht.
- stdout/stderr des Serverprozesses wurden von `data/bot.log` getrennt.

## Prüfungen
- TypeScript: `tsc --noEmit` erfolgreich.
- Haupttests: 47/47 erfolgreich.
- Desktop-Prototyp: 7/7 Tests erfolgreich.
- Syntaxchecks für `scripts/start.cjs`, `prototype/main.cjs`, `prototype/preload.cjs`, `prototype/shell.js` und `prototype/playerExecution.cjs` erfolgreich.
- Server wurde direkt aus TypeScript mit Node 22 gestartet und `/api/health` erfolgreich abgefragt; gemeldete Version: 1.8.4.

## Plattformgrenze
Der vollständige Vite/Rollup-Produktionsbuild kann in der Linux-Prüfumgebung nicht ausgeführt werden, da das Paket absichtlich Windows-Binaries für Rollup/esbuild enthält. Der Windows-Starter erzeugt den aktuellen Produktionsbuild bei Versionsabweichung automatisch und protokolliert Fehler nun sichtbar in den Server-Logdateien.
