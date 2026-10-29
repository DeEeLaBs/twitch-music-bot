async function withDeadline(promise, ms = 2500) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Player command timed out after ${ms}ms`);
      error.code = 'PLAYER_TIMEOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function youtubePlaybackTarget(videoId, autoplayRadio) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error('invalid_video_id');
  return {
    url: `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}${autoplayRadio ? `&list=RDAMVM${encodeURIComponent(videoId)}` : ''}`,
    // loadVideoById starts the song, but does not reliably establish the radio queue.
    useInPagePlayer: !autoplayRadio
  };
}
module.exports = { withDeadline, youtubePlaybackTarget };
