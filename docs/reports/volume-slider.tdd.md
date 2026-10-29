# Volume slider TDD evidence — 2026-10-04

Scope: Player & Warteschlange, NowPlayingCard. User journey: adjusting volume keeps the selected value stable and sends the latest selection to the player in order.

## RED

`node --experimental-strip-types --test tests/volume-slider.test.ts`

Before implementation: 1 passed, 2 failed. A stale player update replaced the selected 40 with 75. A second volume request was dispatched before the first completed ([40, 20] instead of [40]).

## GREEN

Same target after implementation: 5 passed, 0 failed.

- Stale updates cannot overwrite an outstanding local selection; 0 is sent correctly.
- Only one request runs at a time; intermediate selections are coalesced into the latest value.
- Unmount cancels unsent changes.
- Failed commands release the request lock and reconcile with the latest player state, even if that state does not change again. A subsequent selection of 100 is sent.
- Unmount during a request discards its queued successor.

Requests debounce for 150 ms. The display reconciles with the latest reported player volume 1500 ms after the final request completes, allowing player polling to catch up. Errors propagate from App to the component's reconciliation logic.

## Validation

- `npm test`: 156 application tests and 27 desktop tests passed, no failures.
- `npm run lint`: passed (TypeScript).
- `npm run build`: passed, including build verification.
- Coverage: with VOLUME_COVERAGE=1, `node --experimental-strip-types --experimental-test-coverage --test-coverage-include="**/volume-card-fixture.mjs" --test tests/volume-slider.test.ts`. Bundled component: 93.70% lines, 81.82% functions, 43.24% branches. Bundle includes unrelated card rendering and translation branches; overall branch coverage does not reach 80%. This is not a repository-wide coverage result.

Tests render the actual React component using react-test-renderer and the existing esbuild dependency. Physical player/audio behavior and browser pointer interaction were not tested against a running device.

No source plan supplied. No Git checkpoints: this workspace has no Git repository.
