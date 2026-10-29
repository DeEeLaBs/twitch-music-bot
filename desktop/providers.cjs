const providers = {
  youtube: {
    name: 'YouTube Music', home: 'https://music.youtube.com/',
    login: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F',
    partition: 'persist:music-bot-prototype',
    playbackOrigin: 'https://music.youtube.com',
    switchProfile: 'https://www.youtube.com/channel_switcher',
  },

};
function allowedNavigation(provider, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    // Google may return through YouTube account/session endpoints. Restrict
    // the origin, not individual paths in a third-party authentication flow.
    const google = ['accounts.google.com', 'consent.google.com', 'consent.youtube.com'];
    if (provider === 'youtube') return [...google, 'music.youtube.com', 'www.youtube.com', 'youtube.com', 'accounts.youtube.com'].includes(url.hostname);
    return false;
  } catch { return false; }
}
function mediaPermission(provider, permission, origin) {
  return Object.hasOwn(providers, provider) && permission === 'mediaKeySystem' && origin === providers[provider].playbackOrigin;
}
module.exports = { providers, allowedNavigation, mediaPermission };
