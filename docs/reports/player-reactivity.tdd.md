# Player & Warteschlange responsiveness — 2026-10-04

User journey: Spotify progress should move smoothly between status samples, and confirmed song changes should update the displayed position immediately. The user specifically reported progress and song information delays with Spotify.

## Read-only measurements on the running application

Five /api/state requests: 47, 4, 17, 4, 11 ms. Five /api/diagnostics requests: 2, 1, 10, 2, 6 ms. Provider was Spotify.

Passive WebSocket observation over six seconds: initial playback at 7 ms, updates at 1452, 3543 and 5657 ms. Steady intervals: 2091 and 2114 ms, consistent with the existing 2000-ms Spotify playback poll plus network/processing time. These measurements describe the running instance before restart, not a before/after end-to-end benchmark.

## Findings and changes

- Progress previously incremented once per second. It now interpolates every 250 ms using measured elapsed time, including delayed timers, and clamps at track duration. This needs no additional network polls.
- The generic new-track guard could discard a Spotify position over five seconds and display zero until later updates, with a four-second guard. Spotify snapshots contain track identity and position together; their position is now applied immediately. The existing YouTube playing transition guard remains.
- Pausing now applies the confirmed position even when only isPlaying changes. Previously local interpolation could remain ahead while paused.
- Command-triggered Spotify polling previously started after 200 ms. It now starts on the next event-loop turn and retains paced retries if Spotify still reports the previous track. Background polling intervals are unchanged.
- Device discovery still makes a separate API request before commands. This was observed in code, but was outside the user's clarified focus and was not changed.

## RED / GREEN evidence

`node --experimental-strip-types --test tests/player-reactivity.test.ts`

Valid RED before production edits: four failures, showing 20 instead of 20.25 after 250 ms, 0 instead of 50 for a new Spotify song, 21 instead of 20 after pausing, and no immediate command-triggered poll.

Final target: six tests passed. Includes fractional positions displayed as whole seconds, delayed timer behavior and duration bounds. Component tests render the actual NowPlayingCard. Scheduler test uses a fake Spotify service and virtual time, verifying both immediate polling and retrying an old snapshot.

`node --experimental-strip-types --test tests/player-reactivity.test.ts tests/volume-slider.test.ts`: nine tests passed at the initial GREEN checkpoint, including the previous volume regression tests.

`npm test`: 162 application tests and 27 desktop tests passed, zero failures.

`npm run lint`: passed. `npm run build`: passed, including build verification.

## Coverage and limitations

With PLAYER_REACTIVITY_COVERAGE=1, `node --experimental-strip-types --experimental-test-coverage --test-coverage-include="**/player-reactivity-fixture.mjs" --test tests/player-reactivity.test.ts`: bundled card has 87.38% line coverage, 40.00% branch coverage and 71.43% function coverage. This includes unrelated card and translation code; the 80% threshold is not achieved for every metric. No repository-wide coverage claim is made.

Spotify song metadata still depends on when Spotify publishes its state and on periodic polling (about two seconds during playback); zero-delay remote synchronization is not established. Physical audio and visual browser rendering were not changed or benchmarked. The running desktop application was not restarted during playback. Restart the application to load the new backend build.

No source plan supplied. No Git checkpoints were possible because the workspace is not a Git repository.
