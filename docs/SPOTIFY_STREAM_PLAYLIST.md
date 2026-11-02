# Spotify-Übertragung der Stream-Playlist

`!playlist` speichert den aktuellen Song zunächst dauerhaft in der lokalen Liste und versucht danach die Übertragung an die ausdrücklich konfigurierte **Stream-Playlist** auf Spotify. Die Fallback-Playlist für die Wiedergabe wird dafür nicht verwendet.

Die Stream-Playlist-Tabelle zeigt den Übertragungsstatus und bietet **Erneut versuchen** für neue offene oder fehlgeschlagene Einträge. Historische Einträge werden nicht automatisch nachgetragen. Lokales Entfernen löscht nichts auf Spotify.

Für die Playlist muss das verbundene Spotify-Konto Besitzer oder Mitbearbeiter sein. Nach diesem Update kann eine erneute Spotify-Anmeldung erforderlich sein: Zusätzlich zu den vorhandenen Schreibrechten werden Leserechte angefordert, damit auch private Playlists auf Duplikate geprüft werden können. Die Implementierung verwendet die aktuellen `/playlists/{id}/items`-Endpunkte.

Bekannte Spotify-Track-URIs werden direkt verwendet. Bei YouTube-Music-Songs wird anhand von Titel und Interpret gesucht. Automatische Übernahme erfolgt nur bei genau einer unterschiedlichen passenden Track-URI mit übereinstimmenden normalisierten Namen und, soweit bekannt, einer maximal fünf Sekunden abweichenden Laufzeit. Nur Formatierung und ausdrücklich geklammerte Video-/Audio-/Lyrics-Zusätze werden ignoriert. Live-, Remix- und andere Versionszusätze bleiben relevant. Mehrdeutige Treffer bleiben offen; kein Treffer wird gesondert angezeigt.

Vor jedem Schreibversuch werden alle Seiten der Ziel-Playlist gelesen. Bot-Anfragen werden nacheinander verarbeitet. Nach einem möglicherweise ausgeführten, aber nicht bestätigten Schreibversuch gilt eine mindestens 30 Sekunden lange Wartezeit. Danach prüft ein erneuter Versuch den Zielzustand erneut. Spotify-Wartezeiten bei Anfragelimits werden gespeichert und eingehalten. Übertragungsziel und zugeordnete URI bleiben für Wiederholungen erhalten; ein späterer Konfigurationswechsel leitet ausstehende Songs nicht unbemerkt an eine andere Playlist um. Falls sich das eingestellte Ziel geändert hat, kann ein offener Eintrag ausdrücklich über **In eingestellte Playlist übertragen** nach Bestätigung auf dieses Ziel umgestellt werden.

Spotify bietet für diesen Vorgang keinen von dieser Integration verwendeten Idempotenzschlüssel. Änderungen durch andere Programme oder Benutzer zwischen Prüfung und Hinzufügen können daher nicht atomar ausgeschlossen werden.

Offizielle Referenzen: [Playlist-Einträge lesen](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items), [Playlist-Einträge hinzufügen](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist), [Suche](https://developer.spotify.com/documentation/web-api/reference/search).
