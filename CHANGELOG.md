# v1.9.0

- Neues Countdown Studio für Streamstart und Subathons mit eigenen OBS-Links und frei einstellbarer Gestaltung.
- Zeitboni für Subs nach Tier, Geschenk-Abos, Bits, Kanalpunkte sowie Spenden von StreamElements, Streamlabs und TipeeeStream.
- Pausieren, Neustart-Wiederherstellung, maximale Restzeit und feste Endzeitpunkte.
- Einmalige Abschlussaktionen: Sound, Alert, Chatnachricht, Ausblenden und optionales Folgeprofil.
- Eigene Countdown-Schriften als TTF, OTF, WOFF oder WOFF2; Vorschau und OBS laden sie lokal vom Bot.
- `!timer` im Commands-Menü mit Berechtigungen, Cooldown, Syntax und Beispielen.
- Stream-Deck-Plugin 1.1.0 mit Countdown-Steuerung für beide Profile.
- Anbieter-Tokens bleiben verschlüsselt auf dem Rechner. Echte Spendenverbindungen erfordern eigene Tokens; Offline-Ereignisse werden nicht historisch nachgeladen.

# v1.8.2

- YouTube-Requests mit aktivem Autoplay Radio starten über die kanonische Radio-Playlist-URL. Dadurch ist nach einem aus Spotify zugeordneten Titel ein nächster Radio-Song verfügbar; Skip meldet einen Fehler, wenn der Player tatsächlich keinen nächsten Titel hat.
- Ein alter YouTube-Fenstertitel auf der Startseite wird nicht mehr als laufender Song erkannt. Current Playback und Queue warten beim Start eines aus Spotify zugeordneten YouTube-Titels auf eine belastbare Video-ID oder echte Player-Metadaten.
- Songrequests bleiben jetzt in der Queue, wenn im ausgewählten Player bereits ein direkt gestarteter Song läuft oder pausiert ist; der Request wird nicht mehr sofort aus der Queue genommen.
- Current Playback, Steuerbefehle und Queue-Starts folgen ausschließlich dem im Setup gewählten Player. Einträge für den anderen Player bleiben in der Queue, werden aber nicht gestartet. Spotify-Tracklinks werden bei YouTube-Auswahl anhand ihrer Metadaten einem YouTube-Titel zugeordnet; bei Spotify-Auswahl werden sie direkt über Spotify aufgelöst.
- Beim Wechsel zwischen YouTube Music und Spotify wird der bisher aktive Player jetzt pausiert und der Wiedergabezustand geleert, damit der neu gewählte Player direkt für einen neuen Song bereit ist.
- Beim Songwechsel werden Zeitposition und Dauer nur noch übernommen, wenn Timeline und erkannter Track dieselbe Video-ID beziehungsweise denselben Titel besitzen; verspätete Frames des vorherigen Songs können die neue Anzeige nicht mehr überschreiben.
- Current Playback überbrückt nun kurze YouTube-DOM/API-Aussetzer, erkennt Tracks direkt über die Media Session, verwirft veraltete Desktop-Zustände nach acht Sekunden und entprellt kurzzeitig leere beziehungsweise fehlgeschlagene Statusabfragen.
- Laufende YouTube-Musik bleibt in Current Playback sichtbar, wenn die SPA während der Wiedergabe auf Startseite, Suche oder Mediathek navigiert; Identität und Anzeige fallen dann auf Fenstertitel und Media Session zurück.
- Der Current-Playback-Zeitstrahl verwendet jetzt einen unabhängigen, schnellen Timeline-Reader für Position, Dauer, Pause und Lautstärke; er bleibt dadurch auch aktiv, wenn YouTubes großer Metadaten-Extractor auf den URL-Fallback zurückfällt.
- YouTube-Radio-Wechsel aktualisieren Current Playback jetzt zuverlässig: Der ursprüngliche Radio-Seed wird nur noch zur Startbestätigung verwendet; anschließend identifiziert die tatsächlich abgespielte Video-ID den Track.
- Current Playback und Queue wurden auf einen gemeinsamen providerunabhängigen Wiedergabekern umgestellt: YouTube Music und Spotify bleiben gleichzeitig verbunden, während Steuerung und Anzeige dem tatsächlich aktiven Player folgen.
- Song-Requests speichern ihren Ziel-Provider bereits beim Einreihen und behalten ihn auch nach einem späteren Wechsel der bevorzugten Wiedergabequelle.
- Queue, aktiver Request und Verlauf werden mit dem neuen Queue-Format v3 sofort atomar gespeichert; alte Queue-Dateien werden automatisch migriert und doppelte aktive Einträge entfernt.
- Nach einem Bot-Neustart werden aktive YouTube- und Spotify-Requests mit der realen Player-Wiedergabe abgeglichen; abweichende oder gestoppte Requests landen verlustfrei wieder vorne in der Queue.
- Pausierte Hintergrundplayer überschreiben Current Playback nicht mehr, und Fehler eines inaktiven Providers verfälschen nicht länger den Status des tatsächlich laufenden Players.
- Die Google-Konto-Anmeldung befindet sich jetzt passend in der YouTube-Music-Karte unter „Setup“ statt in der Webplayer-Kopfzeile und zeigt Start-, Erfolgs- und Fehlerstatus direkt am Einrichtungsschritt an.
- Der Google-Login meldet nicht mehr sofort beim Öffnen des Browsers Erfolg: Setup verfolgt jetzt Anmeldung, Abbruch und Timeout über einen Desktop-Statusendpunkt und bestätigt den Import erst nach der authentifizierten Weiterleitung zu YouTube Music.
- Läuft nach einem Frontend-Update noch ein alter Electron-Hauptprozess, beendet Setup die endlose Google-Warteanzeige jetzt mit einem klaren Neustarthinweis; eine bereits vorhandene Anmeldung muss nicht wiederholt werden.
- Der YouTube-State-Endpunkt stürzt im leeren Webplayer nicht mehr durch einen falsch eingegrenzten URL-Fallback ab; dadurch wechseln Setup und Companion-Status nach dem Seitenaufbau wieder zuverlässig auf „bereit“.
- Die YouTube-Startverifizierung besitzt jetzt einen rendererunabhängigen URL-Fallback: Wenn der wechselnde YouTube-DOM keinen Status liefert, bestätigt Electron den Track über die aktive, validierte Music-Player-URL und den ursprünglichen Radio-Seed.
- Wiederhergestellte Requests können nicht mehr vor dem Webplayer gestartet werden: Die Companion-API meldet während des Webview-Aufbaus korrekt „nicht bereit“ und die Startschaltfläche bleibt deaktiviert.
- YouTube-Navigation wird nicht mehr synchron bis zum vollständigen Seitenaufbau abgewartet; die echte Player-Bestätigung läuft getrennt mit einem kaltstarttauglichen 45-Sekunden-Fenster.
- Der temporäre Fehler `no_active_ytm_webContents` wird verständlich angezeigt und nach erfolgreicher Webplayer-Verbindung automatisch entfernt.
- YouTube-Music-Katalogersetzungen werden korrekt bestätigt: Wenn YouTube eine angeforderte Video-ID intern durch die passende Musik-Katalog-ID ersetzt, bleibt die ursprüngliche Request-ID über den Radio-Seed zugeordnet.
- Erfolgreiche YouTube-SPA-Weiterleitungen mit `ERR_ABORTED` werden nicht mehr als fehlgeschlagener Songstart behandelt.
- „Nächsten Request starten“ bestätigt einen YouTube-/Spotify-Start erst nach Rückmeldung der echten Video-ID beziehungsweise Spotify-URI; der frühere künstliche „Laden…“-Titel kann keinen Fehlstart mehr auslösen.
- YouTube-Requests bestätigen weiterhin zuerst exakt den gewünschten Titel; bei aktivierter Einstellung „Autoplay Radio“ wird zusätzlich eine Radio-Warteschlange angelegt, damit nach dem letzten Request automatisch ähnliche Musik weiterläuft.
- Dashboard- und Twitch-Wünsche verwenden jetzt dieselbe providerabhängige Auflösung; Textsuche liefert bei aktivem Spotify-Provider eine echte Spotify-URI.
- YouTube-Music-Current-Playback an die neue Playerstruktur angepasst: Metadaten werden jetzt aus Player-API, Media Session, alter/neuer Playerbar und als Rückfall aus dem Dokumenttitel gelesen.
- Current Playback übernimmt jetzt auch direkt in Spotify gestartete Titel inklusive Cover, Interpret, Fortschritt, Dauer, Wiedergabestatus und Lautstärke.
- Play/Pause, Zurück, Weiter und Lautstärke steuern aus der Current-Playback-Karte immer den tatsächlich angezeigten YouTube-Music- oder Spotify-Player.
- Google-Anmeldung für YouTube Music vollständig neu aufgebaut: Sie läuft nun in einem echten installierten Chrome oder Edge statt in einem von Google blockierten Electron-Fenster.
- Nach erfolgreicher Anmeldung werden ausschließlich Google-/YouTube-Sitzungscookies aus einem isolierten Music-Bot-Browserprofil in den persistenten Player übertragen; anschließend lädt YouTube Music automatisch neu.
- YouTube Music und Spotify werden beim Desktop-Start parallel vorgewärmt, sodass ein späterer Provider-Wechsel keinen vollständigen Kaltstart mehr auslöst.
- Der unsichtbare Webplayer bleibt innerhalb der Chromium-Kompositionsfläche statt weit außerhalb des Fensters; beim Öffnen wird seine Oberfläche gezielt neu gezeichnet.
- Eine sichtbare Lade- und Fehleranzeige ersetzt die bisherige schwarze Fläche während des initialen Seitenaufbaus.
- Consent-Cookies werden vor dem Laden des Dashboards gespeichert und Netzwerkverbindungen zu beiden Playern vorab aufgebaut.
- Control Center: Spotify-Cover wird jetzt aus den originalen Spotify-Metadaten übernommen statt aus dem YouTube-Music-Fallback-Treffer.
- Laufende Spotify-Wiedergabe aktualisiert Cover, Titel, Interpret und Dauer aus dem offiziellen Spotify-Playback-Status.
- Der aktuelle Track speichert die autoritativen Spotify-Metadaten, damit Dashboard, OBS-Dock und Overlay dasselbe Cover verwenden.
- Now-Playing-Karte zeigt die aktive Wiedergabequelle korrekt als Spotify oder YTM Desktop an.
- Robuster Cover-Fallback bei leeren oder nicht ladbaren Bild-URLs.

# v1.8.1

- Spotify Premium Player direkt als eigener Dashboard-Tab integriert.
- Web Playback SDK bleibt beim Wechsel zwischen Bot-Tabs verbunden.
- OAuth-Callback führt nach erfolgreicher Anmeldung direkt zum Spotify-Tab.
- Setup öffnet den integrierten Spotify-Player statt eines separaten Browserfensters.
- Separates `/spotify-player.js` und die eigenständige Player-Seite entfernt; `/spotify/player` bleibt nur als kompatible Weiterleitung.
- Integrierter Player zeigt Cover, Titel, Künstler, Fortschritt, Play/Pause, Zurück/Weiter, Lautstärke, Account- und Geräte-Status.

# v1.8.0

- Offizielle Spotify-Premium-Anbindung per OAuth 2.0 Authorization Code + PKCE.
- Spotify Web API / Spotify Connect für Play, Pause, Skip, Zurück und Lautstärke.
- Lokaler `/spotify/player` mit offiziellem Spotify Web Playback SDK als optionales Connect-Gerät.
- Spotify-Track-Requests können direkt über Spotify Premium laufen; YouTube Music bleibt als Fallback erhalten.
- Spotify Refresh Token wird verschlüsselt im bestehenden Secret-Store gespeichert; kein Client Secret erforderlich.
- Eingebetteter experimenteller Spotify-Webplayer im Desktop-Prototyp wird nicht mehr als Spotify-Pfad verwendet.
- Spotify-spezifischer DRM-Setup-Starter entfernt.

## 1.7.2
- Spotify-HTTP-403 bei Widevine-Lizenzanforderungen wird jetzt als nicht behebbarer Laufzeit-Blocker erkannt statt nur wiederholt gemeldet.
- Nach einer abgelehnten Spotify-Audiolizenz werden eingebettete Play/Next-Befehle für die laufende Sitzung gesperrt, um das beobachtete automatische Überspringen mehrerer Titel zu stoppen.
- Wiederholte 403-Meldungen werden zusammengefasst; der Status erklärt den Browser-Fallback und dass Spotify-Songrequests weiterhin über YouTube Music aufgelöst werden können.
- Reload bzw. erneute Anmeldung erlaubt genau einen neuen Wiedergabetest; bei erneutem 403 greift die Sperre wieder.
- Spotify-Steueraktionen werden nur noch als Diagnosefehler protokolliert, wenn die Ausführung tatsächlich fehlschlägt.
- Prototype-Dokumentation und Regressionstest für den 403-Fall ergänzt.

# Changelog

## 1.7.1
- Doppelte `/api`- und `/api/v1`-Registrierung entfernt.
- WebSocket-Nachrichten und Queue-Deltas zwischen Backend und Frontend gemeinsam typisiert.
- Zentrale `BotError`-/HTTP-Fehlerbehandlung vereinheitlicht; unbekannte Serverfehler liefern jetzt `INTERNAL`/500.
- Gemeinsamen Express-Async-Route-Wrapper eingeführt und lokale `any`-Catch-Blöcke in den Routern entfernt.
- Overlay-Asset-Uploads auf asynchrone Dateischreibvorgänge umgestellt.
- HTTP-Integrationstests für Health, Session-Schutz und Validierungsfehler ergänzt.

# 1.7.0

- Größeres internes Refactoring für bessere Wartbarkeit, ohne die bestehende Bedienung des Bots bewusst zu verändern.
- Twitch-Chat-Texte in ein zentrales `twitchMessages`-i18n-Modul ausgelagert; deutsche und englische Laufzeit-/Companion-Antworten verwenden damit denselben Übersetzungspfad.
- Zentrale Command-Registry für Befehlsnamen, Aliase und Standardberechtigungen eingeführt (`!songrequest`, `!np`, `!current` werden dort kanonisch aufgelöst).
- `server.ts` von rund 350 auf unter 100 Zeilen verkleinert; REST-Endpunkte sind jetzt in Core-, Integration-, Playback- und Queue-Router aufgeteilt.
- Einheitliches API-Fehlerformat mit Fehlercodes wie `VALIDATION`, `RATE_LIMITED` und `AUTH_REQUIRED` ergänzt; bestehende `error`-Texte bleiben aus Kompatibilitätsgründen erhalten.
- React-Zustands-/WebSocket-Logik aus `App.tsx` in `useBotState` ausgelagert; Avatar-Auflösung liegt jetzt in `useStreamerAvatar`. Dadurch ist `App.tsx` deutlich kleiner und konzentriert sich stärker auf Layout/Aktionen.
- YTM-Companion-Befehle werden zentral serialisiert und mit kurzem Mindestabstand ausgeführt. Lautstärkeänderungen werden zusätzlich zusammengeführt, sodass schnelles Ziehen des Reglers nicht zu einer Befehlsspitze führt.
- Diagnoseansicht zeigt nun auch die Companion-Befehlswarteschlange, ausstehende Lautstärkeänderungen und den Companion-Circuit-Breaker.
- Architekturtests für Command-Aliase, Standardberechtigungen und deutsch/englische Chat-Lokalisierung ergänzt.
- Testsuite: 42/42 Tests bestanden; TypeScript-Prüfung fehlerfrei; Produktions-Source-Server per `/api/health` erfolgreich gestartet und geprüft.

# 1.6.9

- Codebasis analysiert und mehrere Hot-Paths optimiert, ohne die bestehende Bot-/OBS-Bedienung zu ändern.
- WebSocket-State-Synchronisierung beschleunigt: Queue/History/Blacklist werden nicht mehr bei jedem Playback-Tick vollständig per `JSON.stringify` serialisiert; Queue-Deltas verwenden Sets/Index-Maps statt wiederholter O(n²)-Suchen.
- YouTube-/Spotify-Resolver robuster gemacht: LRU-artiger Cache, begrenzter Negative-Cache, keine Negative-Caches für temporäre Netzwerkfehler und entprellte Cache-Persistenz statt blockierendem Dateischreiben nach jeder Suche.
- Spotify-Auflösung toleriert den Ausfall eines der beiden öffentlichen Metadata-Endpunkte und schützt die JSON-Auswertung vor extrem tiefen Drittanbieter-Payloads.
- YouTube-Music-Kandidaten werden in kleinen parallelen Batches ausgewertet, wodurch Suchanfragen mit fehlender Dauer deutlich weniger seriell warten.
- Queue-Validierung reduziert unnötige Array-Kopien und baut die Requester-Sperrliste nur bei Konfigurationsänderungen neu auf.
- Lokale API-Sitzung regeneriert sich nach einem Bot-Neustart automatisch; ein veralteter Session-Token wird einmal transparent erneuert und der Request wiederholt.
- Songrequest-Limit gibt nun auch bei abgebrochenen HTTP-Verbindungen zuverlässig einen Slot frei.
- Twitch-Ausgaben gegen IRC-Zeilenumbrüche/Steuerzeichen abgesichert und auf eine sichere Nachrichtenlänge begrenzt.
- `!vol`-Hilfe auf den tatsächlich unterstützten Bereich `0-100` korrigiert; `!song` kennzeichnet YTM-Autoplay nicht mehr fälschlich als Zuschauer-Request.
- Strukturierte Dateilogs werden gebündelt geschrieben statt für jede einzelne Chatzeile mehrere synchrone Dateisystem-Aufrufe auszuführen.
- Unnötigen React-State/ungenutzten Volume-Callback im Now-Playing-Widget entfernt und reine TypeScript-Typimports als `import type` markiert.
- Testkommando von `tsx`/native-esbuild entkoppelt: `npm test` nutzt unter Node 22 direkt Type-Stripping und ist dadurch auch mit den mitgelieferten Windows-esbuild-Binaries plattformunabhängig ausführbar.

# 1.6.8

- Spotify-Track-Links als zusätzliche Songrequest-Quelle integriert – ohne Spotify Web API, Client-ID/Secret oder Spotify-Premium für die Linkauflösung.
- Unterstützt `https://open.spotify.com/track/...`, lokalisierte `open.spotify.com/intl-.../track/...`-Links und `spotify:track:...`-URIs.
- Öffentliche Spotify-oEmbed-/Embed-Metadaten werden defensiv ausgelesen; Titel/Interpret werden anschließend gezielt in YouTube Music gesucht und dort abgespielt.
- Matching prüft Titel und – sofern verfügbar – Interpret, um falsche Live-/Cover-/Remix-Treffer zu vermeiden.
- Spotify-Ursprung wird im Queue-Modell gespeichert und in Dashboard/OBS-Dock gekennzeichnet.
- Deutsche und englische Twitch-Antworten für erfolgreiche Spotify-Requests, nicht eindeutige Treffer sowie nicht unterstützte Playlist-/Album-/Artist-Links ergänzt.
- Guide, Queue-Eingabe, Chat-Platzhalter und README um Spotify-Track-Requests erweitert.

# 1.6.7

- Chat-Befehle vollständig an den Sprachwechsel gekoppelt: auch Cooldowns, Queue-Ablehnungen, Wiedergabe-/Companion-Fehler und Skip-Fehler werden nun Deutsch/Englisch ausgegeben.
- Harte deutsche Antworten in der Songrequest-Validierung lokalisiert (Queue voll, Duplikate, Mindestlänge, Sperren, unbekannte Dauer).
- Laufzeitfehler des YTM-Begleitservers werden vor der Ausgabe im Twitch-Chat in die aktive Sprache übersetzt.

# 1.6.6

- OBS-Player-Dock um einen vollständigen Anpassungsbereich erweitert: Layout, Queue-Sichtbarkeit und Anzahl, Cover, Fortschritt, Lautstärke, Schnelllinks, Dichte, Akzentfarbe, Deckkraft und Skalierung.
- Die Einstellungen werden in die erzeugte Dock-URL übernommen und funktionieren damit direkt im benutzerdefinierten OBS-Browser-Dock.
- Lautstärkeregler entprellt und serialisiert: Beim Ziehen wird nicht mehr für jeden Slider-Schritt ein Companion-Befehl gesendet. Übertragen wird beim Loslassen bzw. nach kurzer Eingabepause; parallele Volume-Requests werden zusammengeführt. Dadurch werden HTTP-429/Wartezeitfehler beim längeren Schieben vermieden.
- Dock-Vorschau im Editor vergrößert und der Einstellungsbereich responsiv aufgebaut.

# 1.6.5

- Guide um eine deutlich sichtbare „Available Token Scopes“-Übersicht für Twitch OAuth erweitert.
- Pflicht-Scopes für den IRC-Chat dokumentiert: `chat:read` und `chat:edit`.
- Optionale Kanalpunkte-Scopes erklärt: `channel:read:redemptions` zum Lesen sowie `channel:manage:redemptions` zum Erstellen/Verwalten (inklusive Leserechten).
- Hinweis ergänzt, dass Kanalpunkte mit dem Broadcaster-OAuth-Token autorisiert werden müssen.

# 1.6.4

- OBS Songbot-Dock passt sich automatisch horizontal oder vertikal an.
- Warteschlange direkt im Dock mit Cover, Titel, Interpret, Requester und Dauer.
- Lautstärke-Slider in beiden Layouts, inklusive Mute/Unmute und Prozentanzeige.
- Feste Layout-URLs über `?layout=auto`, `?layout=horizontal` und `?layout=vertical`.
- OBS-Dock-Studio mit Horizontal-/Vertikal-Vorschau.
- `/overlay` erzwingt einen vollständig transparenten Dokument-, Body- und Root-Hintergrund für OBS Browser Sources.
- Bestehenden TypeScript-Fehler in `AppErrorBoundary.tsx` behoben.

# 1.6.3

- Neuer Tab **OBS Dock** mit Live-Vorschau und kopierbarer Dock-URL.
- Neue Route `/dock/player` für OBS unter „Docks → Benutzerdefinierte Browser-Docks“.
- Kompakte YouTube-Music-artige Song-Leiste mit Cover, Titel, Interpret, Fortschritt und Zeit.
- Wiedergabesteuerung direkt im OBS-Dock: Zurück, Play/Pause, Weiter sowie Lautstärke.
- Responsive Darstellung für schmale und breite OBS-Docks.

## v1.6.2
- Overlay-Editor behält beim Ändern von Optionen die Seiten- und Einstellungs-Scrollposition bei.
- Browser-Scroll-Ankerung im Editor deaktiviert, um Sprünge ans Seitenende zu verhindern.

## v1.6.1
- Overlay-Editor auf Desktop als zweigeteilter Arbeitsbereich: Einstellungen scrollen unabhängig, die Vorschau bleibt sticky sichtbar.
- Kompaktere Vorschau auf niedrigen Laptop-Displays; Tablet/Mobil bleibt im natürlichen Seitenfluss.

## v1.6.0
- Overlay-Editor: freie Drag-&-Drop-Positionierung, Profile, lokale Bild-/Logo-Uploads, Requester-Avatar/Badges und Custom CSS.
- Overlay-Assets werden persistent unter data/overlay-assets gespeichert.

## v1.5.0
- Overlay-Studio erweitert: neue Layouts, Schrift- und Designoptionen, Animationen, Fortschrittsstile, lokale Presets und Testdaten-Vorschau.

# 1.4.3

- YTM-Statuschip im Header reagiert jetzt in Echtzeit auf tatsächliche Verbindungs- und Trennereignisse.
- Erfolgreiches Pairing aktualisiert dadurch sofort `YTM: Verbunden`, ohne Seiten-Reload.
- Trennung/Verbindungsverlust setzt den Status ebenfalls wieder auf nicht verbunden.

# 1.4.2

- Entfernt die PowerShell/.NET-Abhängigkeit beim Speichern neuer Twitch- und YouTube-Music-Tokens vollständig.
- Neue Secrets werden ausschließlich mit AES-256-GCM und einem lokalen 256-Bit-Schlüssel verschlüsselt.
- Das YTM-Pairing kann dadurch nicht mehr an `ProtectedData`/PowerShell scheitern.
- Vorhandene ältere DPAPI-Secrets bleiben lesbar, soweit das jeweilige Windows-System sie entschlüsseln kann; neue/erneuerte Tokens werden automatisch im neuen Format gespeichert.

# v1.4.1

- Windows-Tokenverschlüsselung verwendet nun PowerShell SecureString/DPAPI statt der nicht überall verfügbaren `ProtectedData`-Klasse.
- Verschlüsselungsfehler blockieren das Speichern der Bot-Einstellungen nicht mehr; pro Secret steht ein AES-GCM-Fallback bereit.
- Secret-Dateiformat auf v2 erweitert, damit Twitch- und YTM-Token unabhängig mit ihrem jeweiligen Verschlüsselungsmodus gespeichert werden können.
- Overlay-Editor zentriert den Waiting-State horizontal und vertikal korrekt in der Vorschau.

# Changelog

## 1.4.0
- Tokens aus `bot-config.json` entfernt; Windows-DPAPI bzw. lokaler AES-GCM-Fallback für Secret-Speicherung eingeführt.
- Laufzeitvalidierung, Config-Version 4, automatische Migration, `.backup`-Dateien und Backup-Recovery ergänzt.
- Lokale REST-Mutationen mit Sitzungs-Header abgesichert; versionierte `/api/v1`-Routen hinzugefügt, alte `/api`-Routen bleiben kompatibel.
- YouTube-/YTM-Resolver mit persistentem Treffer-Cache, negativem Cache, In-Flight-Deduplizierung, Circuit Breaker und erweitertem Treffer-Ranking ausgebaut.
- Queue um Gesamtlimit, Mindestdauer, Wiederholungsfenster, Requester-Sperren/-Entfernung und Drag-&-Drop-Reihenfolge ergänzt.
- Befehlsberechtigungen und Cooldowns pro Command sowie globale/benutzerbezogene Request-Cooldowns konfigurierbar gemacht.
- Channel-Points-Reward kann mit passendem Scope automatisch erstellt werden und wird periodisch validiert.
- Strukturierte Logs mit Kategorien/Leveln und 5-MB-Rotation; GUI-Logfilter und tokenfreier Diagnoseexport ergänzt.
- WebSocket-Heartbeat sowie getrennte Queue-Delta-Nachrichten ergänzt.
- Standalone-Overlay auf gemeinsame Overlay-Implementierung vereinheitlicht; Presets mit Import/Export hinzugefügt.
- React Error Boundary und Lazy Loading größerer Dashboard-Ansichten ergänzt.
- Typisierten internen Event-Bus und lokales Plugin-Grundgerüst hinzugefügt.
- Regression-/Contract-/Smoke-Tests für Secrets, Backups, Queue-Regeln, Session-Schutz und neue Config-Felder erweitert.

## 1.3.0
- Zentrale `ConfigService`-Schicht eingeführt; gespeicherte Einstellungen und Migrationen liegen jetzt an einer Stelle.
- Twitch-Reconnect auf exponentielles Backoff (5s bis 60s) umgestellt; bei ungültigen Zugangsdaten pausiert der Reconnect bis zur nächsten Änderung.
- Twitch-IRC-Parsing und Kanalpunkte-API aus dem großen Bot-Modul ausgelagert.
- WebSocket-Updates auf partielle State-Patches umgestellt; vollständiger Zustand wird nur noch bei Verbindung/Resync übertragen.
- Queue-/Blacklist-Schreibvorgänge werden kurz gebündelt und weiterhin atomar geschrieben.
- YouTube-Music-Suche besitzt jetzt einen 20-Minuten-Cache, Treffer-Ranking nach Titel/Künstler und Abwertung typischer Cover/Live/Remix-Treffer.
- Resolver-Diagnose mit Cache-Statistik und letztem Suchfehler ergänzt.
- Neue Diagnose-Seite im Dashboard für Twitch, YouTube Music, Queue und Resolver.
- Kanalpunkte-Einstellungen als eigene UI-Komponente ausgelagert.
- Twitch-API-Antworten für Kanalpunkte typisiert; Express-Async-Handler typisiert.
- Neue Regressionstests für Config-Persistenz, YTM-Trefferranking und Suchcache ergänzt.
- Config-Datei erhält eine Schema-Version und migriert ältere Kanalpunkte-Einstellungen automatisch.
- Queue-/Playback-WebSocket-Updates senden nur tatsächlich geänderte Teilbereiche.
- Sauberes Herunterfahren ergänzt: Twitch/YTM-Verbindungen werden getrennt und gebündelte Dateischreibvorgänge vor dem Beenden geleert.
- Startskript installiert fehlende npm-Abhängigkeiten bei einem nötigen Rebuild automatisch nach.
- Twitch-IRC-Tags werden zentral geparst und Twitch-Escapes korrekt dekodiert.

## 1.2.3
- Twitch channel/token can be saved even when Channel Points is enabled before a reward is selected.
- Loading Channel Points rewards now saves the currently entered Twitch channel/token first.
- Channel Points enabled state is stored separately from the selected reward ID.
- Existing configurations are migrated automatically.

## 1.2.2
- Textbasierte Songrequests suchen jetzt zuerst gezielt in YouTube Music nach echten „Songs/Titel“-Treffern.
- Normale YouTube-Videosuche dient nur noch als Fallback, wenn YouTube Music keinen brauchbaren Song liefert.
- Direkte YouTube- und YouTube-Music-Links behalten ihr bisheriges Verhalten.
- YTM-Suchergebnisse behalten Songtitel und Künstler aus YouTube Music; fehlende Dauer wird bei Bedarf separat über die Video-ID ergänzt.

## 1.2.1
- Kanalpunkte-Songrequests in der GUI über einen verständlichen Aktivieren-Schalter steuerbar.
- Twitch-Kanalpunkte-Belohnungen können automatisch über die Twitch API geladen und ausgewählt werden; die manuelle Reward-ID-Eingabe entfällt.
- Prüfung auf gültigen Broadcaster-Token und die Berechtigung `channel:read:redemptions` mit verständlichen Fehlermeldungen ergänzt.
- Warnung ergänzt, wenn eine ausgewählte Belohnung keine Texteingabe verlangt.

## v1.2.0 Hotfix

- Fixed duplicate chat-log entries for commands such as `!help` by removing redundant full-state broadcasts after log events and adding client-side log-ID deduplication.
- Fixed the manual queue `+ Einreihen` controls so the requester, role selector, and action button stay aligned and readable at narrow panel widths.
- Applied both fixes to the source files and the prebuilt `dist` runtime.

# Änderungen 1.2.0

- Dashboard vollständig als responsive Live-Steuerzentrale überarbeitet.
- Konsistente Navigation, Seitenbeschreibungen, Statusanzeigen und Aktionsflächen ergänzt.
- Tastaturbedienbare Tabs mit Pfeil-, Pos1- und Ende-Navigation sowie Sprunglink eingeführt.
- Sichtbare Fokuszustände, größere Bedienflächen, Screenreader-Livebereiche, Formularbeschriftungen, Fehlerzuordnung, Kontrastmodus und reduzierte Animationen ergänzt.
- Warteschlange erhält eine Sicherheitsabfrage vor dem vollständigen Leeren.
- OBS-Designer von vier auf acht Themes und von einem auf drei Layouts erweitert.
- Cover, Fortschritt, Requester und Zeit einzeln schaltbar; Akzentfarbe, Skalierung und Eckenradius konfigurierbar.
- Transparenz-, Dunkel- und Hellvorschau sowie dynamische OBS-Abmessungen ergänzt.
- Overlay-Parameter zentral typisiert, validiert und mit Regressionstests abgesichert.
- Vollständige deutsche und englische Texte für die neue Oberfläche ergänzt.

# Änderungen 1.1.1

- Neue und zuvor fest eingebaute Dashboard-Texte vollständig an die DE-/EN-Umschaltung angebunden.
- Kopplungsassistent, Tokenstatus, Windows-Starthilfe, Fehlerbanner und Request-Neustart übersetzt.
- Bekannte Backend-Diagnosen werden in der englischen Oberfläche auf Englisch dargestellt.
- OBS-Warteanzeige und Steuerelement-Hinweise reagieren ebenfalls auf die gewählte Sprache.
- Bereits gespeicherte Chat-Logs bleiben wie vorgesehen in ihrer ursprünglichen Sprache.

# Änderungen 1.1.0

- YTM-Anbindung auf dokumentierte Companion API v1 vereinheitlicht; IPv4 für localhost.
- Ein Kopplungsweg, Sperre gegen parallele Kopplungen, Tokenprüfung vor Erfolgsmeldung.
- Entfernt: Endpunkt-Raten, tokenloser „Open Mode“, Token-Ausgabe und automatische Simulation nach Fehlern.
- Begrenzte HTTP-Zeitlimits, Rate-Limit-Wartezeit, Socket.IO mit Polling-Fallback.
- Songstart-Bestätigung und gesperrte parallele Queue-Übergänge; Fehler erhalten Requests.
- Vote-Skip am Queue-Ende, explizites Pause/Resume und Lautstärke 0 korrigiert.
- Falsche Ersatz-Video-ID entfernt; unbekannte Dauer führt zur Ablehnung.
- Aktiven Song beim Nutzerlimit berücksichtigen; Duplikate und überfüllte Queue ablehnen.
- Wiederherstellung von aktuellem Request/Queue/Verlauf, atomare JSON-Schreibvorgänge.
- Filtertypen getrennt; konfigurierte Kanalpunkte-Reward-ID statt aller Rewards.
- Begrenzung paralleler Suchanfragen und Twitch-Request-Cooldown.
- Lokaler Server, Host-/Origin-Prüfung, begrenzte Eingabegrößen und Konfigurationsprüfung.
- Tokens aus Zustandsantworten entfernt; allgemeines Formular überschreibt keinen YTM-Token.
- Dashboard-Fehleranzeigen, manueller Request-Neustart, WebSocket-Reconnect auch für OBS.
- Windows-Installation und Produktionsstart, Logdateien, Stop per überprüfter Prozessidentität.
- TypeScript-Fehler behoben; npm-Lockdatei, README und Regressionstests ergänzt.

Keine neuen Komfortfunktionen wie Drag-and-drop, Suchauswahl, automatische Kanalpunkte-Rückerstattung oder EventSub hinzugefügt. Die bisherigen Kernfunktionen wurden repariert und abgesichert.

## 1.8.3
- Control Center artwork fix hardened: Spotify metadata now updates the actual current/pending queue track instead of only the transient playback object, preventing old resolver thumbnails from returning on later state updates.
- Added a same-origin, allow-listed artwork proxy for Spotify/YouTube cover images to avoid embedded-browser hotlink/referrer/loading problems.
- The Control Center now loads remote artwork through the local proxy and keeps a placeholder fallback for failed images.

## 1.8.4
- Startup regression fixed: the main `MusicBot starten.cmd` now starts and verifies the local bot server before launching the desktop shell.
- Dashboard is now the default desktop view; YouTube Music remains available as the dedicated player tab.
- Removed obsolete embedded-Spotify prototype controls and diagnostics because Spotify Premium now lives in the official dashboard integration.
- Unified launch paths so the prototype starter delegates to the main starter instead of opening an unconnected player.
- Server stdout/stderr now use dedicated log files and no longer share `data/bot.log` with the structured application logger.
- Startup waits for the health endpoint and shows the last startup error directly when the server exits early.

## 1.8.5
- Startvorgang selbstheilend gemacht: fehlgeschlagene Builds reparieren einmalig die npm-Abhängigkeiten und versuchen den Build erneut.
- Alter Produktions-Build wird vor einem Update nicht mehr vorsorglich gelöscht.
- Sicherer Source-Fallback auf Node 22/24 Type-Stripping, damit der Bot-Server auch bei einem fehlgeschlagenen Frontend-Build starten kann.
- Startdialog zeigt jetzt stdout und stderr gemeinsam und liest Logs explizit als UTF-8; dadurch keine verstümmelten Umlaute mehr.
- Windows-native esbuild/Rollup-Abhängigkeiten werden vor dem Build geprüft.
