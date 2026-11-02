# Mehrere Overlays

Im Overlay-Designer lassen sich benannte Overlays erstellen, auswählen, umbenennen, duplizieren und löschen. Jedes Design besitzt eine eigene feste ID und eine eigene OBS-Browserquellen-Adresse. Mehrere Quellen können gleichzeitig unterschiedliche Designs anzeigen.

Änderungen werden automatisch nach einer kurzen Bündelung von etwa 150 Millisekunden gespeichert und über eine geschützte Live-Verbindung direkt an die passende OBS-Quelle übertragen. Zusätzlich prüft OBS den gespeicherten Stand jede Sekunde. Der Status zeigt laufende und fehlgeschlagene Speicherungen; bei Fehlern bleibt der Entwurf erhalten und lässt sich erneut speichern. Vor einem Wechsel des Overlays, Duplizieren oder Verlassen des Designers wird die Speicherung abgeschlossen. Bei einem Fehler bleibt der Designer geöffnet. Beim Schließen des Browsers warnt er vor noch ungespeicherten Änderungen. Die Kopie lässt sich unabhängig bearbeiten.

Die Verwaltung steht in einer eigenen Leiste oberhalb des Designers. Auswählbare Karten zeigen Namen, Auflösung und Ebenenanzahl. Die zuletzt gewählte Karte wird beim nächsten Öffnen wieder ausgewählt. **OBS-URL kopieren** kopiert die Adresse des ausgewählten Overlays. Umbenennen verändert die ID und die OBS-Adresse nicht. Löschen muss bestätigt werden; die gelöschte Adresse zeigt anschließend einen Fehlerzustand.

Beim ersten Zugriff wird das bisherige Design vollständig als **Mein Overlay** in `data/overlays.json` übernommen. `data/overlay-config.json` bleibt erhalten. Weitere Starts wiederholen die Übernahme nicht. Alte OBS-Adressen ohne Overlay-ID zeigen weiterhin das übernommene Design, solange es nicht gelöscht wurde. Ist die Hauptdatei beschädigt, wird ein gültiges Backup verwendet; ohne lesbare Quelle wird keine leere Sammlung über vorhandene Daten geschrieben.

Der eigenständige Alert-Designer bleibt mit seiner bisherigen Bibliothek verfügbar. Über **Aus Alert-Designer importieren** können seine Clips ausdrücklich in ein Overlay übernommen und dort gespeichert werden. Die bloße Auswahl eines Alert-Widgets überschreibt keine bereits gespeicherten Clips.

Schreibzugriffe verwenden weiterhin die lokale Sitzung; OBS-Abfragen benötigen den bestehenden Overlay-Token. Ungültige oder gelöschte IDs werden nicht auf andere Designs umgeleitet.
