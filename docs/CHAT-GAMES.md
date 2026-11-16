# Chat-Spiele

## Bedienung

Unter **Chat-Spiele** ein Spiel und einen Inhalt auswählen und **Runde starten** drücken. Fragen, Wörter, Hinweise, Abenteuer, Rundenzeit und Zahlenbereich werden unter **Einstellungen & Inhalte** gepflegt. Gültige Änderungen werden automatisch gespeichert. Alle Spielarten enthalten eigene Beispielinhalte. Es läuft kanalweit höchstens eine Runde; das vorhandene Glücksrad bleibt unabhängig.

Im Overlay-Designer unter **Alerts → Chat-Spiele** ein Widget hinzufügen, positionieren und skalieren. Mehrere Overlay-Adressen zeigen dieselbe Runde. Die Designer-Vorschau ist statisch und startet nichts. Nach der Auswertung bleibt das Ergebnis acht Sekunden sichtbar, danach ist die Ausgabe transparent.

| Befehl | Berechtigung / Wirkung |
| --- | --- |
| `!game start quiz` | Mods/Broadcaster: erste gespeicherte Quizfrage starten |
| `!game start zahlen` | Mods/Broadcaster: Zahlenraten starten |
| `!game start wort` | Mods/Broadcaster: erstes gespeichertes Wort starten |
| `!game start abenteuer` | Mods/Broadcaster: erstes gespeichertes Abenteuer starten |
| `!game finish` | Mods/Broadcaster: auswerten bzw. aktuelle Abenteuer-Abstimmung abschließen; fehlgeschlagene Auswertung erneut speichern |
| `!game cancel` | Mods/Broadcaster: ohne neue Punkte abbrechen |
| `!game pause`, `!game resume` | Mods/Broadcaster: Abenteuer pausieren/fortsetzen |
| `!game choose 1` | Mods/Broadcaster: im pausierten Abenteuer Option 1 wählen |
| `!play <Antwort>` | Zuschauer: Antwort, Tipp oder Optionsnummer abgeben |
| `!points`, `!points top` | Eigene Punkte / Top 5; einmal pro Person in 30 Sekunden |

Aliase: `!spiel`, `!antwort`, `!punkte`. Ein optionaler dritter Parameter beim Start wählt die gespeicherte Inhalts-ID; im Dashboard ist die Auswahl ohne IDs bedienbar. Die Befehle sind auch unter **Commands & Regeln** registriert. Verwaltungsaktionen bleiben zusätzlich fest auf Mods/Broadcaster beschränkt.

## Regeln

- **Quiz:** Zwei bis vier Auswahlantworten, erste gültige Antwort pro Person zählt. Richtige Antworten erhalten je 10 Punkte bei Zeitablauf oder manueller Auswertung.
- **Zahlenraten:** Geheime, mit `crypto.randomInt` gleichverteilt gezogene ganze Zahl im konfigurierten Bereich. Erster richtiger Tipp erhält 10 Punkte. Hinweise erscheinen im Overlay und gebündelt im Chat.
- **Wort erraten:** Ganzes Wort mit `!play` raten; erster richtiger Tipp erhält 10 Punkte. NFKC-Normalisierung, deutsche Kleinschreibung, Satzzeichen entfernen, Leerraum zusammenfassen. Umlaute und Buchstaben bleiben unterscheidbar: „Äpfel“ entspricht nicht „Apfel“. Keine unscharfe Bewertung.
- **Abenteuer:** Eine Stimme pro Person je Entscheidung; Änderungen sind möglich. Mehrheit gewinnt, Gleichstand wird gleichverteilt ausgelost und im Chat benannt. Ohne Stimmen wird pausiert. Mods können eine Option wählen oder ein neues Abstimmungsfenster öffnen. Keine individuellen Punkte. Spätestens nach 30 Entscheidungsschritten wird beendet.

Für Tipps und Stimmen gilt ein Abstand von zwei Sekunden je Person. Die Reihenfolge der serverseitigen Verarbeitung entscheidet bei gleichzeitig eintreffenden richtigen Tipps. Nicht jede Eingabe erzeugt eine Chat-Antwort.

## Grenzen und Sicherheit

- Rundenzeit 10–300 Sekunden; Zahlenbereich innerhalb 1–10000.
- Bis zu 100 Quizfragen, 100 Wörter, 20 Abenteuer mit je 50 Szenen und vier Entscheidungen je Szene.
- Bis zu 1000 Teilnehmer je Runde; bis zu 50000 dauerhaft gespeicherte Punkte-Konten. Dashboard zeigt Top 100.
- Abenteuer benötigen gültige Verweise und von jeder erreichbaren Szene einen Weg zu einem Ende. Zyklen sind möglich und durch das Schrittlimit begrenzt.
- Nur frische IRC-Nachrichten des konfigurierten Kanals mit stabiler Twitch-Nutzer-ID werden verarbeitet. Bekannte Wiederholungen, fremde Shared-Chat-Quellen, Bot-Echos und Kanalpunkte-Eingaben werden ausgeschlossen.
- Eigene Spiele-Ausgaben: höchstens acht Nachrichten pro 30 Sekunden, mindestens 2,5 Sekunden Abstand, maximal 380 UTF-8-Bytes je Nachricht, begrenzte Warteschlange. Lange Inhalte werden aufgeteilt. Andere Bot-Funktionen verwenden weiterhin ihren bisherigen Versandweg. Die Spielebegrenzung ersetzt keine globale Twitch-Begrenzung aller Bot-Nachrichten.
- Einstellungen und Lösungen werden ausschließlich per sitzungsgeschütztem Dashboard-Endpunkt gelesen. Der token-geschützte OBS-Endpunkt liefert keine Einstellungen, Lösungen vor Auswertung, Teilnehmer-IDs oder Verwaltungs-Token. Auch die Browser-Bundles enthalten die serverseitigen Beispiel-Lösungen nicht.
- Keine zusätzlichen Rechte, externen Inhalte, Downloads oder Abhängigkeiten. Feldtexte werden als React-Text ausgegeben.

Die aktuellen offiziellen Twitch-Grenzen sind unter [Chat & Chatbots](https://dev.twitch.tv/docs/chat) und [IRC Concepts](https://dev.twitch.tv/docs/chat/irc/) beschrieben. Die Anbindung verwendet weiterhin den vorhandenen IRC-Login; es wurde keine zusätzliche Twitch-Verbindung eingerichtet.

## Speicherung und Wiederanlauf

`data/chat-games.json` enthält Einstellungen, Punkte anhand Twitch-Nutzer-IDs, eine aktive Rundenmarkierung und die letzten 256 Abschluss-IDs. Anzeigenamen werden bei einer erneuten Punktevergabe aktualisiert und erzeugen kein neues Konto. Abschluss und Punkte werden gemeinsam über die vorhandene atomare Speicherung geschrieben. Erst nach erfolgreichem Schreiben wird das Ergebnis veröffentlicht.

Bei fehlgeschlagener Auswertung bleibt dieselbe Auswertung eingefroren. Weitere Antworten sind gesperrt. Laufzeitsteuerung oder **Auswertung erneut speichern** wiederholen ausschließlich diesen Abschluss. Ein Abbruch verwirft die offene Auswertung ohne neue Punkte. Bei Neustart werden unterbrochene Runden ohne nachträgliche Auswertung beendet. Einstellungen und bereits gespeicherte Punkte bleiben erhalten.

Ein unlesbarer Speicher wird aus dem Backup wiederhergestellt. Sind beide unlesbar, bleiben die Dateien erhalten und schreibende Aktionen werden gesperrt. Es gibt keinen automatischen Ranglisten-Reset.

## Umsetzung und Prüfung

1. Gemeinsames Modell und Validierung in `chatGames.ts`; Beispiele ausschließlich in `server/gameDefaults.ts`.
2. `GameService`: Spielregeln, private Lösungen, Zeitabläufe, atomare Abschlüsse und begrenzte Chat-Ausgaben.
3. `GameChat` und bestehender IRC-Parser: registrierte Befehle, Rollen, Aktualität, Deduplizierung und Kanalprüfung.
4. Geschützte API, Dashboard-Inhaltseditor und gemeinsames Overlay-Widget.

Gezielte Tests prüfen alle Spielarten, Stimmenänderungen, Gleichstände, Zyklen, Zeitabläufe, Rollen, den tatsächlichen IRC-Parser, parallele HTTP-Starts, veraltete Abenteuer-Aktionen, private Ausgabe, Bundle-Grenzen, stabile Punkte-Identität, Schreibfehler, Backup, Neustart und Chat-Limits mit kontrollierter Uhr. Typprüfung, gesamte Testsuite und Build werden zusätzlich ausgeführt.

Browserprüfung in isolierter lokaler Instanz: alle vier Spiele mit synthetischen Chat-Nachrichten durchgespielt, zwei verschiedene Overlay-Adressen geprüft, Fragenänderung gespeichert und nach Neuladen erhalten, Widget-Ausgabe und 390-Pixel-Layout kontrolliert. Die OBS-Seiten zeigten keine Konsolenfehler. Das Dashboard meldete lediglich den in der Testinstanz bewusst nicht gestarteten YouTube-Companion auf Port 9863; Spiel-Anfragen waren erfolgreich.

Keine echten Twitch-Nachrichten gesendet, keine laufende Nutzersitzung beendet, keine echte OBS-/Electron-Prüfung. Kein Push oder Release.
