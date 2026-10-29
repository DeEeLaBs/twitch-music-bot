# Overlay centering: TDD evidence

Added a designer switch using the existing textAlign option and persistence/live OBS update path. Centered alignment also applies to requester/source/time text, playlist alerts and symmetric marquee padding. Layout positions are unchanged.

RED: New rendered designer test failed because the switch was absent. GREEN: Switch is restored correctly for both saved left/center settings; URL round-trip remains valid. Six focused tests pass; TypeScript check and production build pass. Installed standalone frontend updated with index backup, without changing personal data. No Git repository is present. Visual browser verification was not performed.
