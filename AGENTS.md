# Agent Guidelines & Token Efficiency Protocol

## 1. Arbeitsverzeichnis & Struktur
- Projekt-Root für den Bot ist: `twitch-music-bot/`
- Vor dem Durchsuchen ganzer Ordner **immer** zuerst `twitch-music-bot/PROJECT_INDEX.md` lesen.

## 2. Token-Sparregeln (Streng einhalten)
- **Selektives Lesen:** Nutze in `read_file` immer `StartLine` und `EndLine`, anstatt ganze 1000-Zeilen-Dateien einzulesen.
- **Log-Dateien ignorieren:** Niemals `*.log`, `data/*.log`, `dist/` oder `node_modules/` ungefiltert auslesen.
- **Diff-basierte Edits:** Verwende `edit_file` für präzise Modifikationen, statt ganze Dateien mit `write_file` zu überschreiben.
- **Gezielte Tests:** Führe bei Änderungen nur den betroffenen Test aus (z. B. `node --test tests/queue.test.ts`), statt der gesamten Suite, wenn es um schnelles Feedback geht.

## 3. Architektur-Prinzipien
- **Modularität:** Backend-Dienste liegen isoliert in `src/server/`. State-Verwaltung in `atomicStore.ts` und `secureTokenStore.ts`.
- **Typensicherheit:** TypeScript Strict Mode; keine unnötigen `any`-Typen einführen.
- **Fehlerbehandlung:** Externe API-Aufrufe (Twitch, Spotify, YouTube) müssen stets mit Timeouts und Fallbacks abgesichert sein.
