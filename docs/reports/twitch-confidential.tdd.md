# Twitch Confidential Apps: TDD evidence

Added recovery of an existing Twitch device login using a locally encrypted client secret, exposed through /api/twitch/oauth/resume and a setup button. Public device login remains unchanged. A confidential Twitch app still requires its owner's client secret; no secret is bundled.

RED: Two new tests failed because resume was missing. GREEN: Both pass, covering recovery without a new device flow, rotated refresh credentials after restart and rejection when renewable credentials are absent. Full suite: 173 application tests + 29 desktop tests passed. TypeScript check and standalone build passed. Real confidential Twitch credentials were not supplied, so live refresh remains unverified.

The installed G: copy's server and frontend were updated with backups. Personal data was not changed. No Git checkpoint is available because this directory has no Git repository.
