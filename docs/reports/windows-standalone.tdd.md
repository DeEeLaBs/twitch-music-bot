# Windows desktop standalone — TDD and delivery evidence, 2026-10-04

Journey: unzip and start MusicBot.exe on Windows x64 without installing Node.js, npm, Electron or YouTube Music Desktop separately. The desktop UI, companion service, backend and their runtime dependencies must travel together.

## Changes

Replaced the incomplete server-only standalone builder. It now bundles backend and desktop JavaScript, includes the complete installed castLabs Electron runtime, includes Node v24.19.0, keeps all runtime license notices, supplies the executable/bootstrap/launcher and provides a source snapshot excluding node_modules, personal data and environment secrets. The builder rejects unresolved package imports except Electron/native Node modules. Portable settings and browser profiles live in Portable/data.

The launcher starts its bundled server with its own working directory, removes inherited Node hooks/dependency search paths, checks ports 3000/9863, waits for health before loading the UI, and ends the child server when the application quits. DRM initialization uses the included runtime online.

## RED / GREEN

`node --experimental-strip-types --test tests/standalone.test.ts`: two failing tests first for the missing portable launcher, then two passing tests. They verify included executable/entrypoint paths, production environment, independence from global module/hooks, and accepting only the expected bot health identity.

## Native package smoke test

`node scripts/smoke-standalone-desktop.cjs <Portable directory>` passed against the final package. The test copies the artifact to a temporary directory, remaps ports to free ephemeral ports and hides the test window. It launches the actual included MusicBot.exe with no installed-project dependency path, only the Windows system PATH, and no personal account environment values.

Observed: desktop window title DeEe Song Bot – Stream Dashboard; Player and Queue DOM elements present; backend health ok; companion endpoint present and returning 503 because no logged-in/ready music webview was available in the fresh test profile. The executable opened the real built dashboard. Screenshot saved alongside the package. Closing the native application also stopped its backend child. No real user accounts or playback were used.

An initial smoke harness needed correction for esbuild's numeric rendering of port 3000 as 3e3 and the expected disconnected companion status 503; those were harness corrections, not application failures.

## Verification

- `npm test`: 169 application tests plus 27 desktop tests passed (196 total).
- `npm run lint`: passed.
- Node syntax checks for launcher and builder passed.
- `npm run build:standalone`: passed, with Vite and both esbuild bundles, external import checks, complete runtimes and licenses.
- Narrow launcher unit coverage: 19.18% lines, 100% executed branches, 40% functions. Native application smoke is a separate process and not included in that report. The 80% full-file threshold was not established.

## Limits

Requires Windows x64, internet and account setup; Spotify playback controls require the existing Spotify Premium / client configuration. First DRM setup downloads runtime components automatically. Playback with authenticated Spotify/YouTube accounts and DRM on a clean second PC was not verified. Google sign-in uses Edge/Chrome provided on Windows. Personal credentials are intentionally absent from the distribution.

No plan supplied. No Git repository exists here, so checkpoint commits were unavailable.
