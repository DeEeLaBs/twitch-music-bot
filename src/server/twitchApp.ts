// The Twitch application ("Client ID") that ships with the bot.
//
// It must be registered once, by the project owner, as a *Public* client in the Twitch
// developer console (category "Chatbot"; "Device Code Flow" needs no redirect handling and
// no Client Secret). A Client ID is public by design, so it is safe to ship in the app.
// Users can still use their own Twitch app via the "Advanced" section of the setup.
export const BUILT_IN_TWITCH_CLIENT_ID = 'rlkmgpmzigs5avi1zew4w1k9qtoxr3';

const CLIENT_ID_PATTERN = /^[a-z0-9]{10,64}$/i;

/** Client ID of the shared app, or '' when none is bundled. MUSICBOT_TWITCH_CLIENT_ID overrides it. */
export function builtInTwitchClientId(): string {
  const candidate = (process.env.MUSICBOT_TWITCH_CLIENT_ID || BUILT_IN_TWITCH_CLIENT_ID).trim();
  return CLIENT_ID_PATTERN.test(candidate) ? candidate : '';
}

export function isBuiltInTwitchClientId(clientId: string): boolean {
  const builtIn = builtInTwitchClientId();
  return Boolean(builtIn) && clientId.trim() === builtIn;
}
