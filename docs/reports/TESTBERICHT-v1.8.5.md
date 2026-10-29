# Testbericht v1.8.5

- TypeScript-Prüfung: erfolgreich (`node node_modules/typescript/bin/tsc --noEmit`).
- Haupttests: erfolgreich.
- `scripts/start.cjs`: Syntaxprüfung erfolgreich.
- Source-Fallback: `server.ts` wurde unter `NODE_ENV=production` mit Node Type-Stripping gestartet und `/api/health` konnte erfolgreich antworten.
- Der Windows-spezifische npm/Vite/esbuild-Build kann in der Linux-Testumgebung nicht vollständig ausgeführt werden, da das Paket Windows-native Binaries enthält. Der Startpfad repariert diese Abhängigkeiten unter Windows nun automatisch und fällt bei Buildfehlern auf den getesteten Source-Server zurück.
