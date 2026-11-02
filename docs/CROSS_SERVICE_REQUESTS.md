# Song-Links zwischen Spotify und YouTube Music

`!sr` (einschließlich seiner Aliase) und die manuelle Eingabe im Dashboard verwenden `resolveForPlaybackProvider`. Ein fremder Song-Link wird anhand seiner Metadaten beim ausgewählten Player gesucht. Die Player-Einstellung und laufende Wiedergabe werden dabei nicht geändert. Bestehende Berechtigungen, Cooldowns, Sperrlisten und Queue-Grenzen bleiben wirksam.

Unterstützt werden einzelne Spotify-Track-URIs und Track-Links auf `open.spotify.com` (auch internationale und Embed-Adressen) sowie YouTube-/YouTube-Music-Watch-Links, `youtu.be` und einzelne Embed-/Shorts-/Live-Adressen. Ein Watch-Link mit Playlist-Parameter bezeichnet weiterhin ausschließlich das angegebene Video. Album-/Playlist-Adressen ohne einzelnen Song und unbekannte Domains werden abgelehnt. Spotify-Kurzlinks mit Weiterleitung werden nicht automatisch verfolgt; stattdessen den vollständigen Track-Link verwenden. Netzwerkzugriffe gehen an feste Anbieter-Adressen; automatische Weiterleitungen werden verweigert.

## Zuordnung

- Titel und Interpret müssen nach Normalisierung von Schreibweise, Akzenten und Satzzeichen übereinstimmen. Nur eigenständige Video-/Audio-/Lyrics-Klammerzusätze werden ignoriert.
- Live-, Remix-, Cover-, Instrumental- und sonstige Versionszusätze bleiben erhalten.
- Kandidaten benötigen eine positive Laufzeit. Bei bekannter Quelllaufzeit beträgt die maximale Abweichung fünf Sekunden.
- Mehrere passende unterschiedliche Anbieter-IDs sind mehrdeutig. Wiederholte Ergebnisse derselben ID werden zusammengefasst. Auch verschiedene Albumveröffentlichungen derselben Aufnahme können deshalb zur Ablehnung führen.
- Fehlende oder generische Quellinterpreten führen nicht zu einer automatischen Übernahme. Bei Ablehnung wird nichts eingereiht; die Oberfläche beziehungsweise der Chat nennt den Grund.

Die Spotify-Suche prüft bis zu zehn Suchergebnisse. Die bestehende YouTube-Music-Suche prüft bis zu zwölf Kandidaten und verwendet bei fehlendem Treffer die bestehende YouTube-Suche mit denselben strengen Kriterien. Bei mehrdeutigen Ergebnissen erfolgt keine schwächere Ersatzsuche.

## Daten und Grenzen

Wiedergabe-ID und Adresse gehören zum gewählten Zieldienst. Ursprüngliche Anfrage, Quellnamen sowie bekannte Spotify-/YouTube-IDs bleiben als zusätzliche Informationen erhalten und werden mit der Queue gespeichert. Bei YouTube-Wiedergabe liegt eine bekannte Spotify-ID in `sourceSpotifyUri`; `!playlist` nutzt sie direkt. Bestehende Einträge benötigen keine Migration.

Spotify benötigt die bestehende funktionsfähige Anmeldung; zur Spotify-Wiedergabe gilt weiterhin die vorhandene Premium-Prüfung. Spotify-Anfragelimits werden wie bisher behandelt. YouTube-Suchlimits verhindern unmittelbare erneute Suchanfragen während der mitgeteilten Wartezeit.

Die YouTube-Anbindung verwendet weiterhin den vorhandenen öffentlichen Seiten-/Metadaten-Resolver. Sie ist keine neu eingerichtete offizielle YouTube-Data-API-Anbindung. Änderungen an diesen Seiten, Zugriffsbeschränkungen oder fehlende Metadaten können eine Zuordnung verhindern. Die öffentliche Spotify-Metadatenauflösung für YouTube-Wiedergabe bleibt ebenfalls von der Verfügbarkeit der Embed-Seiten abhängig. Es werden keine Medien heruntergeladen und keine Zugangsbeschränkungen umgangen.

Offizielle Referenzen: [Spotify-Suche](https://developer.spotify.com/documentation/web-api/reference/search), [Spotify-Track-Metadaten](https://developer.spotify.com/documentation/web-api/reference/get-track), [YouTube Data API: Videos](https://developers.google.com/youtube/data/reference/rest/v3/videos/list). Die letzte Referenz beschreibt die offizielle API, nicht die bestehende öffentliche Seitenanbindung dieses Bots.
