# Testbericht – v1.7.1

## Automatische Prüfungen

- `npm run lint` / `tsc --noEmit`: **erfolgreich, 0 TypeScript-Fehler**
- `npm test`: **44/44 Tests bestanden**
- Neue HTTP-Integrationstests: Health-Endpunkt, Session-Schutz und zentrale Validierungsfehler über einen echten temporären Express-Server geprüft.

## Zusätzlich geprüft

- `/api` und `/api/v1` werden in `server.ts` jeweils nur noch einmal registriert.
- Die Route-Module besitzen keine lokalen `catch(error:any)`-Blöcke mehr.
- `useBotState` verarbeitet Queue-Deltas ohne `any` und verwendet den gemeinsamen WebSocket-Nachrichtenvertrag aus `src/types.ts`.
- Overlay-Asset-Schreibzugriff ist asynchron.

## Build-Hinweis

Der vollständige Vite/esbuild-Produktionsbuild ist in dieser Linux-Arbeitsumgebung weiterhin nicht zuverlässig ausführbar, weil das Projektpaket die Windows-esbuild/Rollup-Binaries enthält. TypeScript- und Node-Testlauf sind davon unabhängig und vollständig erfolgreich. Der bestehende Windows-Start-/Buildmechanismus bleibt unverändert.
