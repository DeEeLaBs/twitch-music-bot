# Testbericht – v1.8.2

## Behobener Fehler

Das Cover im Control Center konnte bei Spotify-Requests vom YouTube-Music-Fallback-Treffer stammen oder während des Spotify-Starts kurz auf veralteten Metadaten bleiben. Dadurch wurde nicht zuverlässig das originale Spotify-Albumcover angezeigt.

## Änderungen

- Spotify-Requests behalten das originale Spotify-oEmbed-Cover als primäres Artwork.
- Während und nach dem Start einer Spotify-Wiedergabe werden Titel, Interpret, Cover und Dauer mit dem offiziellen Spotify-Playback-Status abgeglichen.
- Die autoritativen Spotify-Metadaten werden im aktiven Track übernommen, damit Control Center, OBS-Dock und Overlay dieselbe Darstellung erhalten.
- Die Now-Playing-Karte zeigt Spotify/YTM als tatsächliche Wiedergabequelle und hat einen lokalen Fallback für nicht ladbare Cover.

## Prüfung

- `npm run lint`: erfolgreich, 0 TypeScript-Fehler.
- `npm test`: 47/47 Tests bestanden.
