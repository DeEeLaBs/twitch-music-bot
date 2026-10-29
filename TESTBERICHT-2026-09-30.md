# Bot-Test vom 30.09.2026

## Webplayer-Ladezeiten und graue Zwischenfläche

- Nutzer-Messung Spotify vor der DNS-Korrektur: DOM 18.185 ms, vollständiger Dokument-Ladevorgang 19.999 ms.
- Neue Navigation-Timing-Diagnose: YouTube-Namensauflösung dauerte 11.710 ms. HTTP/3-Abschaltung und Entfernen der Service-Worker-Registrierungen verbesserten den Start nicht; diese experimentellen Einstellungen wurden nicht beibehalten.
- Windows-Desktop verwendet jetzt den Systemresolver ohne automatische DoH- und zusätzliche HTTPS-DNS-Abfragen. Keine Windows-Systemeinstellungen wurden geändert.
- Erneuter Desktop-Prozessstart mit vorhandenem Profil/Cache: YouTube DOM 2.219 ms, Dokument geladen 2.251 ms. Spotify DOM 855 ms, Dokument geladen 1.000 ms, sichtbare Inhalte durch Preload bestätigt nach 2.015 ms. Dies sind Prozess-Neustarts, keine Messungen mit vollständig geleertem Browsercache.
- Preload wartet auf Seiteninhalte mit Layout-Fläche und zwei Renderframes. Ein leeres Dokument wird nicht bereits bei DOM-ready freigegeben. Nach 20 Sekunden ohne Inhalt erscheint ein Fehler statt einer grauen Fläche; Hintergrund-Ladevorgänge verdecken bestehende Inhalte nicht.
- Drei Regressionstests für leere Inhalte, fehlende Layout-Fläche und Timeout bestanden. TypeScript, Produktions-Build und Desktop-Syntaxprüfung bestanden. Spotify nach Neustart und Tab-Wechsel visuell geprüft; Oberfläche angezeigt.
- Gespeicherte Providerwahl nach dem Spotify-Test wieder auf den zuvor verwendeten YouTube-Music-Player gestellt.

## Zweiter Durchlauf: Spotify live verfügbar

- Gesamte automatisierte Suite, TypeScript und Desktop-Syntaxprüfung erneut erfolgreich.
- Live-Request „One More Time“ angelegt und über Queue-Start abgespielt; Current Playback meldete den richtigen Titel und laufende Position.
- Pause und Fortsetzen über die Bot-API erfolgreich; Pausenstatus wurde überprüft.
- Skip des letzten Requests erfolgreich. Spotify bestätigte anschließend „Riot“, die gespeicherte Backup-Playlist und `shuffle_state: true`.
- Weiteren Fehler behoben: Die Skip-HTTP-Antwort verwendete immer YouTube-Verbindungsstatus und -Fehler. Sie verwendet jetzt den gewählten Provider und den QueueManager-Fehler. Neuer HTTP-Regressionstest sowie alle sieben HTTP-Tests bestehen; TypeScript und Produktions-Build erfolgreich.
- Beim Live-Test war die Queue leer. Ein Testrequest wurde verbraucht; die Backup-Playlist wurde anschließend weiterlaufen gelassen.
- Echte Twitch-Ereignisse, erneute Kontoanmeldungen und eine visuelle Komplettprüfung wurden auch in diesem Durchlauf nicht durchgeführt. Die nachstehenden Einschränkungen zum fehlenden Spotify-Webplayer betreffen nur den ersten Durchlauf.

## Ergebnis

Die vorhandene automatisierte Testsuite, TypeScript-Prüfung, Desktop-Syntaxprüfung und der Produktions-Build bestehen. Zusätzlich wurden zehn Prüfungen gegen den laufenden Server erfolgreich durchgeführt. Dies ist keine Bestätigung sämtlicher externer Live-Integrationen.

## Behobene Fehler

- Spotify-Backup-Playlist: Wartende YouTube-Requests verhinderten den Start der Playlist, obwohl kein Spotify-Request wartete. Die Fortsetzung berücksichtigt jetzt den Provider. Regressionstest ergänzt.
- Queue-Wiederherstellung: Beim Laden wurden maximal 100 Requests behalten, obwohl die Konfiguration 500 zulässt. Die Wiederherstellung erhält jetzt bis zu 500. Getestet mit 250 Requests und unveränderter Reihenfolge.
- Blacklist-Wiederherstellung: Eine bewusst leere Blacklist wurde mit Standardfiltern überschrieben. Eine gültige leere Datei bleibt jetzt leer. Regressionstest ergänzt.

## Automatisiert abgedeckt

Die Suite prüft unter anderem Chatbefehle und Berechtigungen, Request-Auflösung, Providerwahl, Startbestätigung, Queue-Persistenz, Spotify-Backup und Shuffle-Anfragen, Skip-Priorität und Fehlerbehandlung, YouTube-Metadaten und Zeitachsen, Konfigurationsvalidierung, OAuth-Abläufe mit simulierten Antworten sowie OBS-Konfiguration und Übersetzungen.

## Am laufenden Server geprüft

- Health- und Zustands-API: HTTP 200.
- Dashboard, Overlay, Standalone-Overlay und Player-Dock: HTTP 200.
- Fremde Origin: HTTP 403.
- Konfigurationsänderung ohne Sitzung: HTTP 403.
- Ungültige Lautstärke: HTTP 400.
- WebSocket: initiale Zustandsnachricht empfangen.

## Noch offen

Spotify meldete nur zwei inaktive Lautsprecher und keinen Webplayer. Deshalb wurden diesmal keine echten Songs gestartet oder übersprungen. Die acht vorhandenen Requests wurden nicht absichtlich verändert. Echte Spotify-/YouTube-Wiedergabe, visuelle Bedienprüfung, Twitch-Chat und Channel-Points mit echten Ereignissen bleiben separat live zu prüfen. Der Produktions-Smoke-Runner benötigt Port 3000 und wurde wegen des bereits laufenden Bots nicht parallel gestartet; die oben genannten Live-Prüfungen änderten keine gültigen Einstellungen.
