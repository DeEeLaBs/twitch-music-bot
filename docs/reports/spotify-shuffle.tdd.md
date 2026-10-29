# Spotify skip / shuffle TDD evidence — 2026-10-04

User journey: when Spotify is already playing the fallback playlist, repeated dashboard skips advance its shuffled context rather than restarting the playlist. Queued requests retain priority, and skipping the final isolated request still starts the fallback playlist.

## Cause and change

QueueManager.skipCurrent previously treated external Spotify playback with a configured fallback playlist as an isolated request. Every skip restarted that playlist, repeatedly resetting its context. Restrict direct playlist starts to current isolated requests / queue playback. External playlist playback uses the plugin's normal Next command. Spotify playlist starts now enable shuffle before setting the playback context; a rejected shuffle command prevents the playlist start.

## RED / GREEN

`node --experimental-strip-types --test tests/spotify-fallback.test.ts`

Before implementation: 16 passed, 2 failed. Eight external skips sent zero Next commands and restarted the playlist. API command ordering was Play then Shuffle instead of Shuffle then Play.

After implementation: 18 passed, zero failures. Regression test verifies eight Next commands and zero playlist starts. Ordering test verifies Shuffle before Play and no Play if Shuffle fails. Existing tests verify request priority, fallback after the final request, failure preservation, late metadata handling and provider-change guards.

## Verification

- `npm test`: 164 application tests and 27 desktop tests passed, zero failures.
- `npm run lint`: passed.
- `npm run build`: passed, including build verification.
- `node --experimental-strip-types --experimental-test-coverage --test-coverage-include="**/src/server/spotifyService.ts" --test-coverage-include="**/src/server/queueManager.ts" --test tests/spotify-fallback.test.ts`: targeted suite coverage across the full two service files is 37.58% lines, 69.53% branches, 35.48% functions. This narrow suite does not cover their unrelated functionality and does not meet the 80% overall threshold. No full-repository coverage claim is made.

Spotify remains responsible for choosing shuffled tracks; these tests establish correct commands and context continuity, not a guarantee of unique random songs. Live playback was not manipulated and the application was not restarted. Restart the app to load the updated backend build.

No plan supplied. No Git checkpoints possible: the workspace has no Git repository.
