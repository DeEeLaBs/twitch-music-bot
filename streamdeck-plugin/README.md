# Stream Deck plugin for the Twitch Music Bot

Control the bot from an Elgato Stream Deck. The plugin talks to the bot on `127.0.0.1:3000` (same PC only), so the
bot must be running. Keys show "Bot offline" while it is not, and reconnect automatically when it starts.

## Install

**From the bot (recommended):** open the bot's Setup page and use the **Elgato Stream Deck** card. One click opens the
plugin in the Stream Deck app, which asks you to confirm. When the bot ships a newer plugin than the installed one,
the card shows "Update available". This works when the plugin was bundled with the bot (the Windows standalone build
always tries to; see below).

**By hand:**

```
npm run streamdeck:pack          # from the project root; needs Node 20+
```

Then double-click `streamdeck-plugin/release/com.twitchmusicbot.streamDeckPlugin`. The actions appear in the Stream
Deck app under **Twitch Music Bot**.

### How the plugin gets into the bot

- `npm run streamdeck:pack` packs the plugin and copies it to `dist/streamdeck/`. A plain `npm run build` re-copies an
  already packed plugin (fast) but does not re-pack it.
- `npm run build:standalone` packs the plugin itself and ships it in `Portable/dist/streamdeck/`. If packing fails
  (for example offline on the first run, because the plugin's own dependencies need installing), the standalone is
  still built, without the plugin, and `BUILD-INFO.json` says `streamDeckPluginIncluded: false`.
- The "update available" hint compares the plugin's `Version` in `manifest.json`. It is derived from
  `streamdeck-plugin/package.json`, so **bump that version whenever the plugin changes**.

For development: `cd streamdeck-plugin && npm run build && npx streamdeck link com.twitchmusicbot.sdPlugin`.

## Actions

| Group | Actions |
|---|---|
| Playback | Play / Pause, Next, Previous, Volume up / down (steps of 5), Start queue, Clear playback error, Now playing (title, artist, album art; press = play/pause) |
| Queue and moderation | Remove next song, Clear queue (press twice), Block current requester (press twice), Queue length (press = start queue) |
| Switches | Song requests open / closed, Autoplay radio, Channel Points requests |
| Stream Deck + | Volume dial: turn = volume (2 % per tick), press = mute / unmute |

Notes:

- **Press twice:** destructive keys show "Press again" and only run if pressed again within 3 seconds.
- **Requests closed:** viewers get a chat message and are not queued (channel points are refunded). The broadcaster and
  moderators can still request. The setting is saved, so it survives a restart.
- **Channel Points:** the switch only works once a reward is set up in the bot.
- **Album art:** JPEG, PNG and GIF covers are shown. Other formats fall back to the plain title layout.

## Development

```
npm test        # unit tests for the core (state, client, commands, rendering)
npm run lint    # type check
npm run build   # bundle + generate manifest.json and icons from the action catalog (src/core/commands.ts)
```

`src/core/` has no dependency on the Stream Deck SDK and holds all logic. `src/plugin.ts` only forwards SDK events and
draws images. To add an action, add it to `ACTIONS` in `src/core/commands.ts` (and a look in `render.ts`); the manifest
is generated from that list.
