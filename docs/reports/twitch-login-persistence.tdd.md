# Twitch login persistence — TDD evidence, 2026-10-04

Journey: Twitch authentication and its renewable token survive credential writes by other services and application restart. Automatic renewal restores a connected status after a transient failure.

## Cause and repair

SecureTokenStore instances independently cached the shared secrets.json object. TwitchOAuthService saved refresh and expiration tokens, then ConfigService wrote the access token from its older copy. This could remove the newly stored refresh token. Spotify or companion credential saves could likewise remove Twitch credentials. Read current file contents for each access / mutation; synchronous atomic writes and encryption remain in place. The encryption-key cache remains.

TwitchOAuthService now restores connected state after successful token renewal instead of retaining a previous error state.

## Tests first

`node --experimental-strip-types --test tests/twitchOAuth.test.ts`

First RED: six existing tests passed, two new tests failed. An unrelated provider save deleted the stored Twitch refresh token. The device-login / config-save / restart test lost its saved access token.

First GREEN: eight tests passed after the storage repair.

Second RED: the successful-retry test still reported error instead of connected after renewal. Second GREEN: all nine tests passed after the OAuth state repair.

Guarantees include preserving both providers' credentials, seeing other stores' latest writes, deleting one provider's token without deleting Twitch's, persistence across fresh ConfigService/OAuth/store instances, rotated renewal credentials surviving another restart, and clearing a transient refresh error.

Existing Twitch tests previously used the real workspace credentials directory. Added per-test temporary working directories for the entire suite, so auth test writes now target temporary files only. Network interactions use mocked Twitch responses.

## Verification

- `npm test`: 167 application tests and 27 desktop tests passed, zero failures.
- `npm run lint`: passed.
- `npm run build`: passed, including build verification.
- `node --experimental-strip-types --experimental-test-coverage --test-coverage-include="**/src/server/secureTokenStore.ts" --test-coverage-include="**/src/server/twitchOAuthService.ts" --test tests/twitchOAuth.test.ts`: nine passed. Combined targeted file coverage: 77.37% lines, 62.89% branches, 86.21% functions. OAuth file line coverage 90.64%. The narrow auth suite does not cover all legacy encryption and error paths; the 80% threshold is not met for every metric. No repository-wide coverage claim.

No real Twitch login or live token renewal was performed. The running application was not restarted. A refresh token that was already overwritten cannot be regenerated from an access token; one new Twitch login is needed after loading the repair if the saved renewal token is missing.

No plan supplied. Git checkpoints unavailable because the workspace is not a Git repository.
