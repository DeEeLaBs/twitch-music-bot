# Standalone Spotify DRM repair — 2026-10-04

User report: Spotify sometimes rejects tracks and otherwise becomes silent after about eleven seconds in the portable release.

## Confirmed packaging defect

The builder renamed electron.exe to MusicBot.exe but kept its VMP signature as electron.exe.sig. MusicBot.exe.sig was absent in the user's running portable installation. The supplied signature itself was valid for production streaming: Castlabs EVS verification reports a valid streaming signature with 1382 days remaining. The certificate has no VMP development-only extension. No EVS account signup or signing request was necessary.

Repair: move the signature together with its executable during packaging and reject missing/empty signature files. The user's existing portable installation received the matching sidecar and the updated DRM/launcher scripts; previous script copies were retained. Account settings and browser profiles were not modified and the running application was not terminated.

The launcher also now waits for Widevine readiness before opening the desktop/webplayer. If initialization fails, it records the problem and still opens the dashboard.

## Tests before implementation

`node --experimental-strip-types --test tests/standalone.test.ts`: two existing tests passed and two new runtime/signature tests failed before the helper was implemented. Afterwards all four passed, including signature renaming and missing-signature rejection.

`node --test desktop/drm.test.cjs`: three existing tests passed and two new startup-order tests failed before the helper was implemented. Afterwards all five passed, including waiting for the component and reporting an initialization failure without suppressing the dashboard.

## Verification

- `npm test`: 171 application tests + 29 desktop tests passed (200 total).
- `npm run lint` and Node syntax checks: passed.
- `npm run build:standalone`: passed.
- Castlabs `verify` against both the repaired installed MusicBot.exe and newly built MusicBot.exe: valid streaming signature.
- Native dashboard smoke test of the new artifact: Player/Queue rendered, backend health ok, companion endpoint present; fresh profile returned 503 before an active music webview became ready.
- `node scripts/verify-standalone-drm.cjs <Portable>`: public encrypted test video in a fresh profile returned PLATFORM_SOFTWARE_VERIFIED, played to 20.087666 seconds, paused=false, readyState=4, mediaError=0, licenseFailure=false. This uses the actual renamed executable and matching signature. The initial probe loaded content without explicitly starting playback; the final probe starts playback once, then checks uninterrupted progress rather than repeatedly resuming it.
- DRM helper coverage via `node --experimental-test-coverage --test-coverage-include="**/desktop/drm.cjs" --test desktop/drm.test.cjs`: 100% lines, 93.33% branches, 80% functions. No repository-wide coverage claim.

Live authenticated Spotify tracks were not controlled during these checks. The encrypted-media test validates the repaired DRM path beyond the reported eleven-second boundary; it does not assert every Spotify track/account succeeds.

## Supporting documentation

Castlabs describes VMP signatures, platform verification and broken signatures at https://github.com/castlabs/electron-releases/wiki/VMP and signature verification at https://github.com/castlabs/electron-releases/wiki/EVS.

No source plan supplied. Git checkpoint commits unavailable because this workspace has no Git repository.
