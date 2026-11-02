# Persönliche Begrüßungen

## Einrichten

1. Im neuen Menü **Begrüßungen** einen Twitch-Login auflösen und hinzufügen. Gespeichert wird die feste Twitch-Benutzer-ID; ein späterer Namenswechsel erzeugt keine zweite Begrüßung.
2. Pro Person Sound (MP3, WAV, OGG; maximal 12 MB) und/oder GIF (maximal 8 MB, 4096×4096 Pixel) hochladen. Beide Ausgaben sind unabhängig schaltbar. Lautstärke und Dauer (1–30 Sekunden) einstellen und speichern. Die Dauer begrenzt auch die Sound-Wiedergabe.
3. Im Overlay-Designer das Widget **Begrüßungen** hinzufügen, positionieren und speichern. Im Begrüßungsmenü dieses Overlay als Ausgabe auswählen und speichern. Auch reine Sounds benötigen das Widget in einer aktiven OBS-Browserquelle, bleiben aber visuell transparent.
4. Die lokale **Vorschau testen** spielt nur im Verwaltungsfenster. Sie erzeugt kein Live-Ereignis, nimmt keine Ausgabequelle in Besitz und verändert die Begrüßungsmarkierung nicht.

Es gibt keine Standard-Begrüßung für unkonfigurierte Personen und keinen Auslöser beim bloßen Betreten des Chats. Die erste echte Nachricht zählt auch dann, wenn sie ein Befehl ist. Bestehende Befehlsberechtigungen gelten weiter.

## Live-Sitzung und Einmaligkeit

Die Stream-ID, Kanal-ID und Startzeit stammen aus Twitchs **Get Streams**. Der Status wird alle 15 Sekunden und vor einer geeigneten Nachricht frisch bestätigt. Ohne aktive Begrüßungsprofile werden keine zusätzlichen Twitch-Abfragen ausgeführt. Bei unbekanntem oder offline gemeldetem Status wird keine Begrüßung verbraucht. Simulierte Chatnachrichten und Overlay-Chatwiederholungen durchlaufen den Live-Auslöser nicht. Alte Nachrichten (über 15 Sekunden), fremde Kanäle und eigene Bot-Echos werden ignoriert.

Die bereits begrüßten Benutzer-IDs werden vor dem Einreihen atomar in `data/greetings.json` gespeichert. Neustarts, doppelte Nachrichten und Reconnects starten sie nicht erneut. Die letzten acht echten Stream-Sitzungen bleiben erhalten. Hauptdatei und Backup werden geprüft; unlesbare Daten werden nicht durch leere Einstellungen überschrieben.

## Ausgabe und Unterbrechungen

- Nur das ausgewählte Overlay mit sichtbarem Begrüßungs-Widget darf Ereignisse beziehen. Bei mehreren geöffneten Kopien besitzt eine Browserinstanz die Ausgabe. Eine kurzlebige, alle 500 ms erneuerte Berechtigung läuft nach vier Sekunden ohne Erneuerung ab.
- Die Warteschlange umfasst höchstens 20 Begrüßungen. Einträge verfallen 60 Sekunden nach ihrer Einreihung. Überzählige und verfallene Begrüßungen werden verworfen und bleiben für diesen Stream verbraucht.
- Bei fehlender OBS-Quelle wartet die Warteschlange bis zum Ablauf. Bei Neustart geht die offene Warteschlange verloren; die Einmaligkeitsmarkierungen bleiben erhalten.
- Ein bereits begonnenes Ereignis wird nach einem Ausgabefehler, Neuladen oder Verbindungsabbruch nicht erneut abgespielt. Bei Übernahme durch eine andere Quelle wird das unterbrochene Ereignis verworfen. Die nächste Begrüßung kann danach folgen.
- Ein Quellenwechsel beendet das aktuelle Ereignis und wartet vor einer neuen Zuweisung das alte Ausgabefenster ab. Live-Status unbekannt, offline oder eine neue Stream-ID verwerfen alte offene Ausgaben. Die lokale Ablaufzeit berücksichtigt die gesamte Anfrage-Laufzeit konservativ.
- Defekte Medien bremsen die Warteschlange höchstens bis zur eingestellten Dauer; sind alle aktivierten Medien ausgefallen, wird vorzeitig fortgesetzt. Die Vorschau meldet Wiedergabefehler. Audio kann in normalen Browsern eine Benutzeraktion zur Freigabe erfordern; die OBS-Quelle muss Audio ausgeben dürfen.

Die Verarbeitung bevorzugt **höchstens einmal** gegenüber Wiederholung: Bei Unterbrechungen kann eine Begrüßung ausfallen, sie wird nicht nachträglich erneut gestartet.

## Prüfungen und Grenzen

### Optionale Chat-Begrüßung

Pro Person lassen sich zusätzlich `chatEnabled` und `chatMessage` einstellen. Im Menü steht dafür „Nachricht im Chat“ mit separatem Schalter, Textfeld und lokaler Textvorschau bereit. `{user}` wird durch den erwähnten Twitch-Login ersetzt, `{name}` durch den Anzeigenamen. Vorhandene Profile erhalten deaktivierten Chattext als Standard. Text und Aktivierung werden mit den übrigen Einstellungen gespeichert.

Der Text wird über die vorhandene Twitch-Bot-Verbindung bei der ersten akzeptierten Nachricht des echten Livestreams gesendet. Er benötigt keine OBS-Quelle und funktioniert unabhängig von Sound/GIF; reine Chat-Begrüßungen belegen die Medienwarteschlange nicht. Die bestehende dauerhafte Erfassung bereits begrüßter Personen schützt auch den Chat vor Wiederholungen. Erst wird diese Erfassung erfolgreich gespeichert, anschließend wird gesendet. Bei Verbindungsfehlern gibt es keine automatische Wiederholung, um doppelte Begrüßungen zu vermeiden. Bereits begrüßte Personen erhalten durch spätere Aktivierung keine nachträgliche Nachricht im selben Stream.

Der Text ist auf 250 Zeichen begrenzt; Steuerzeichen, Zeilenumbrüche und führende Chat-Befehle werden abgewiesen. Nach dem Einsetzen der Platzhalter begrenzt die Formatierung die Ausgabe auf 350 UTF-8-Bytes, ohne Zeichen zu zerschneiden. Die Medienvorschau und die Textvorschau senden keine echte Chat-Nachricht.

Prüfung der Erweiterung: 476 Tests, Typprüfung und Build erfolgreich. In einer getrennten Browser-Testumgebung wurden Chat-Aktivierung, Platzhalter-Vorschau, Speichern und Wiederherstellung nach Neuladen geprüft. Die Tests decken zusätzlich Chat ohne OBS, kombinierte Medien-/Chat-Ausgabe, parallele Wiederholungen, Neustarts, Offline-Zustand, fehlgeschlagene Speicherung und unsichere Texte ab. Es wurde keine echte Twitch-Chat-Nachricht zum Testen gesendet.

Die Verwaltungsoberfläche trennt die Ausgabe-Einrichtung, die durchsuchbare Personenliste, Sound-/GIF-Einstellungen und die lokale Vorschau. Eine sichtbare Speicherleiste zeigt ungespeicherte Änderungen an. Bei schmalen Fenstern werden die Bereiche untereinander angeordnet; der Menübereich bleibt auch beim Scrollen frei. Die Bedienprüfung verwendet einen ausschließlich lokalen, ungespeicherten Profilentwurf. Geprüft wurden Suche, Bearbeitung, die deaktivierte Vorschau ohne Medien sowie Layouts bei 320, 768, 1024 und 1440 Pixeln ohne horizontales Überlaufen. Typprüfung, zehn Begrüßungs-Tests und Build sind erfolgreich.

Tests sichern Live-/Offline-Unterscheidung, Neustarts, stabile IDs, Ablauf, Reihenfolge, exklusive Ausgabe, verspätete Antworten, kurze Netzfehler, späte Audiofehler, Upload-Signaturen und Zugriffsschutz ab. Browserprüfungen verwenden getrennte Testdaten und simulierte Twitch-Live-Daten; ein echter Twitch-Livestream und hörbare Ausgabe in OBS wurden damit nicht nachgewiesen.

Referenzen: [Twitch Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams), [Twitch IRC](https://dev.twitch.tv/docs/chat/irc).
