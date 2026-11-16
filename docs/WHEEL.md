# Glücksrad

Im Menü **Glücksrad** zwei bis dreißig Felder mit Text (maximal 80 Zeichen) und Farbe anlegen. Die Pfeile ändern die Reihenfolge. **Felder speichern** übernimmt die Konfiguration dauerhaft; Entwürfe werden beim Verlassen geschützt.

Im Overlay-Designer unter **Alerts → Glücksrad** das Widget hinzufügen und wie andere Widgets positionieren und skalieren. Mehrere Overlays dürfen das Widget enthalten. Alle Quellen zeigen ein gemeinsames Rad; die Auswahl im Designer hat keinen Einfluss auf die Ausgabe. Die Vorschau zeigt gespeicherte Felder ohne Auslosung.

**Einblenden** zeigt das Rad ohne Drehung. **Drehen** startet die sechs Sekunden lange Drehung. Danach bleibt das Ergebnis fünf Sekunden sichtbar und das Widget verschwindet. **Ausblenden** ist im Bereitschafts- und Ergebniszustand möglich. Während einer Drehung sind Änderungen und Ausblenden gesperrt. Das letzte Ergebnis bleibt im Dashboard bis zur nächsten Ziehung oder zum Neustart sichtbar.

Die Auswahl erfolgt gleichverteilt mit `node:crypto.randomInt` auf dem Server. Eine Vorgangs-ID macht wiederholte Dreh-Anfragen desselben Vorgangs idempotent. Neue Vorgänge erhalten neue IDs; veraltete Anfragen werden abgelehnt. Konfiguration und Laufzeit sind getrennt: `data/wheel.json` wird atomar mit Backup gespeichert. Ein Neustart startet ausgeblendet und übernimmt die Felder. Beschädigte Originaldateien werden aus dem Backup wiederhergestellt oder gegen Überschreiben gesperrt.

OBS-Widgets lesen den zentralen Zustand token-geschützt alle 300 ms. Zeitstempel erlauben das Fortsetzen einer laufenden Animation beim Wiederverbinden. Bei Ausgabefehlern wird das Widget sicher ausgeblendet. Netzwerklatenz und pausierte Browserquellen können den sichtbaren Start verzögern; Gewinner und Endwinkel bleiben gleich. Reduzierte Animationen werden berücksichtigt. Feldtexte werden als React-Text ausgegeben.

Keine Chat-Auslöser, Sounds, Gewichtung oder Folgeaktionen. Keine zusätzlichen Berechtigungen, Abhängigkeiten oder Player-Eingriffe.

## Prüfung

`tests/wheel.test.ts` prüft Validierung, kontrollierte Gewinner, Zeigergeometrie, Wiederholungen, Speicherung, Backup, Speicherfehler, Phasen, Wiederverbindungen und Szenenspeicherung. `tests/wheel-api.test.ts` prüft Sitzungsschutz, Overlay-Zugriff und parallele Dreh-Anfragen über HTTP.

Browserprüfung in einer isolierten Instanz: Felder speichern, Einblenden, Drehen, zwei verschiedene Overlay-Adressen mit identischer Vorgangs-ID, identischem Ergebnis und Endwinkel, anschließendes Ausblenden. Dashboard bei 390 Pixel Breite ohne horizontalen Überlauf. Keine echten OBS- oder Electron-Interaktionen durchgeführt; laufende Nutzersitzung unverändert.
