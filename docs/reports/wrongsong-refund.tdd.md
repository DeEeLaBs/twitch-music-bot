# Wrong-song refund: TDD evidence

Root cause: IRC PRIVMSG tag id was passed as a channel-point redemption ID. IRC message IDs are not redemption IDs. The chat processing now fetches unfulfilled redemptions for the configured reward and matches user_id, exact trimmed input and a 10-second timestamp window. Paginated scans are bounded and never guess on ambiguity or incomplete scans. Empty lookup is retried briefly for propagation. Existing 60-second withdrawal/fulfillment behavior is retained.

RED: Missing lookup tests and chat dispatcher regression failed; an additional test showed missing redemption metadata suppressed the refund-failure message. GREEN: Correct lookup excludes another viewer and old entries; ambiguity rejected; IRC dispatch uses real redemption ID; unavailable refunds remain honest. Existing cancellation/fulfillment tests pass. Full suite: 180 application + 29 desktop tests. TypeScript and standalone build passed.

Refund API rejections now log HTTP status and context without tokens. Twitch API constraints still apply: broadcaster authorization, channel:manage:redemptions, reward owned by the same client, and unfulfilled status. Failed historical requests containing old chat IDs are not automatically refunded by this change. No live channel points were changed or refunded during verification. Installed G: server/frontend updated with backups; personal data unchanged. No Git repository available.

Reference: https://dev.twitch.tv/docs/api/reference/#update-redemption-status
