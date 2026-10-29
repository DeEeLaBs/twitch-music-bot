# Countdown Studio

Im Dashboard unter **Countdown** gibt es getrennte Profile für Streamstart und Subathon.
Die bestehende Song-Restlaufzeit und der einfache „Eigener Timer“ bleiben erhalten.
Im Szeneneditor kann ein Countdown-Widget zusätzlich **Streamstart** oder **Subathon**
als Quelle verwenden. Die eigene Countdown-OBS-URL zeigt Titel, Bonus, Summe und
Abschluss-Alert und spielt den Abschluss-Sound. Szenen-Widgets zeigen die Laufzeit.

## Einrichten

1. Profil auswählen, Startzeit in Stunden/Minuten/Sekunden einstellen und speichern.
2. Optional eine maximale Restzeit oder einen festen Endzeitpunkt festlegen.
3. Unter **Zeitboni** die gewünschten Quellen aktivieren und Zeiten festlegen.
   Die Quellen sind anfangs ausgeschaltet, damit es keine überraschenden Boni gibt.
4. Bei Kanalpunkten die vorhandenen Twitch-Belohnungen laden und jeder gewünschten
   Belohnung einen Zeitbonus zuordnen. Alternativ die Reward-ID eingeben.
5. Unter **Bei null** Sound, Alert, Chatnachricht, Ausblenden und Folgeprofil einstellen.
6. Eigene OBS-URL als Browserquelle hinzufügen (Empfehlung: 1000 × 360 Pixel).
   In OBS Audiowiedergabe zulassen. Die URL enthält einen privaten Overlay-Schlüssel.
7. **Starten**. Bis zum Start ist die eigene OBS-Quelle unsichtbar.

Unter **Darstellung → Schrift → Schrift hochladen** können eigene TTF-, OTF-,
WOFF- und WOFF2-Dateien bis 12 MB geladen werden. Die Auswahl und Schriftbibliothek
werden pro Profil gespeichert. Vorschau und eigene Countdown-OBS-Quelle laden
die Schriftdatei direkt vom Bot; auf dem OBS-Rechner ist keine Installation nötig.

Beide Profile können unabhängig laufen. Ein Twitch-Ereignis kann deshalb beide
Profile verlängern, wenn dort die entsprechende Quelle eingeschaltet ist.
Geschenk-Abos zählen pro verschenktes Abo und entsprechend dem Tier. Empfänger-
Benachrichtigungen werden nicht zusätzlich gezählt. Resubs zählen als ein Abo,
nicht als die Anzahl der bisherigen Abo-Monate.

Bits und Spenden werden anteilig berechnet: 50 Bits bei 60 Sekunden/100 Bits
geben 30 Sekunden. 2,50 EUR bei 60 Sekunden/EUR geben 150 Sekunden. Pro Währung
wird eine eigene Regel verwendet; unbekannte Währungen werden ignoriert. Es gibt
keine automatische Wechselkursumrechnung.

## Grenzen, Pause und Neustart

- **Unbegrenzt verlängern**: keine selbst gesetzte Obergrenze; technisch maximal
  366 Tage Restzeit. Einzelne Startzeiten und Bonusregeln haben dieselbe Obergrenze.
- **Maximale Restzeit**: der Bonus wird nur bis zum eingestellten Maximum gutgeschrieben.
- **Fester Endzeitpunkt**: auch Startzeit, Boni und Pausen dürfen diesen Zeitpunkt
  nicht überschreiten. Der Zeitpunkt wird im Menü in der Ortszeit eingegeben.
- **Pausieren** friert die Restzeit ein. Boni werden weiterhin gutgeschrieben.
- Ein laufender Timer berücksichtigt beim Neustart die verstrichene Zeit. Ein
  pausierter bleibt pausiert, außer sein fester Endzeitpunkt ist bereits erreicht.
- Bei null werden Abschlussaktionen einmalig ausgelöst. Der Zustand wird vor den
  externen Aktionen gespeichert, damit ein Neustart sie nicht doppelt auslöst.
  Falls der Rechner genau zwischen Speichern und Chatversand abstürzt, kann die
  Chatnachricht ausfallen. Sie wird nicht automatisch wiederholt.
- Audio wird in der eigenen OBS-Quelle abgespielt; Quelle und Bot müssen dafür
  geöffnet sein. Ein alter Abschluss-Sound wird beim späteren Öffnen nicht nachgeholt.
- Ein beendeter Timer wird durch weitere Ereignisse nicht wieder gestartet.
- Ein Folgeprofil startet nur, wenn es nicht bereits läuft oder pausiert ist.
  Gegenseitige Folgeprofile sind nicht erlaubt. Für einen OBS-Wechsel beide
  Profil-URLs als Quellen hinzufügen; das noch nicht gestartete Profil ist unsichtbar.
- Identische Ereignis-IDs werden dauerhaft über Neustarts hinweg für 24 Stunden
  gespeichert. Ereignisse älter als 24 Stunden bzw. vor dem Profilstart zählen nicht.

## Spendenanbieter

Unter **Spendenanbieter** lassen sich alle drei Anbieter unabhängig verbinden.
Die Verbindungen gelten für beide Profile; die jeweiligen Bonusregeln sind pro
Profil einstellbar. Tokens werden verschlüsselt im vorhandenen Secrets-Speicher
abgelegt und nicht an Dashboard, Overlay oder Diagnoseantworten zurückgegeben.
Ein leeres Tokenfeld behält den gespeicherten Token. Ausschalten trennt die Verbindung.

- **StreamElements:** JWT und Channel-ID des Twitch-Kanals eingeben.
  Der Adapter verwendet Astro `channel.tips` und zählt erfolgreiche Transaktionen.
- **Streamlabs:** Socket API Token eingeben, keinen OAuth Access Token.
- **TipeeeStream:** API Key und Benutzernamen eingeben. Der Socket-Host wird über
  die dokumentierte Discovery-Schnittstelle abgefragt.

Die Adapter verbinden sich nach Abbrüchen erneut. Es werden ausschließlich
Spenden konsumiert; Subs, Bits und Kanalpunkte kommen direkt über Twitch EventSub.
Für eine gespiegelte Zahlung nur einen Anbieter aktivieren: unterschiedliche
Anbieter-IDs lassen sich ohne gemeinsame Transaktionskennung nicht sicher abgleichen.
Ereignisse während eines länger getrennten Bots werden nicht historisch nachgeladen.
Live-Verbindungen mit echten Anbieterkonten müssen nach Eingabe der Tokens geprüft
werden. Die automatisierten Tests verwenden dokumentierte Nachrichten und lokale
WebSocket-Testserver; sie ersetzen keinen echten Zahlungstest.

Offizielle Schnittstellen:

- [StreamElements Astro](https://docs.streamelements.com/websockets)
- [StreamElements Tips](https://docs.streamelements.com/websockets/topics/channel-tips)
- [Streamlabs Socket API](https://dev.streamlabs.com/docs/socket-api)
- [TipeeeStream Socket API](https://api.tipeeestream.com/api-doc/socketio)
- [Twitch EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types)

## Steuerung

Dashboard: starten, pausieren, fortsetzen, zurücksetzen und beliebige Sekunden
hinzufügen/abziehen. Beim Zurücksetzen wird nachgefragt.

Moderatoren und Streamer können im Chat steuern:

Im **Commands-Menü** steht `!timer` unter Moderation mit Syntax und Beispielen.
Dort sind **Mod+**, **Nur Streamer** und **Deaktiviert** wählbar. Ein eingestellter
Timer-Cooldown gilt auch für Moderatoren und Streamer. Zuschauer erhalten über
dieses Menü keine Countdown-Steuerrechte.

```text
!timer streamstart start
!timer subathon pause
!timer subathon resume
!timer subathon add 300
!timer subathon add -60
!timer subathon reset
```

Stream Deck enthält für beide Profile Start, Pause, Resume, Reset, +1 Minute
und -1 Minute. Reset benötigt eine zweite Bestätigung. Plugin nach einem Update
neu bauen/installieren; die neuen Aktionen erscheinen nicht im alten Plugin.

Countdown-Zustand: `data/countdowns.json`, Verbindungen ohne Tokens:
`data/countdown-connections.json`. Beide haben Backups. Beschädigte Countdown-
Dateien werden aus dem Backup wiederhergestellt; sind beide unlesbar, werden
Änderungen blockiert, statt die Daten stillschweigend zu ersetzen.
