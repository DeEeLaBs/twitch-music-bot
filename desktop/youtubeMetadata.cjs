function titleFromDocument(value) {
  const title = String(value || '').replace(/\s*[|–—-]\s*YouTube Music.*$/i, '').trim();
  if (!title || /^YouTube Music$/i.test(title)) return '';
  return title;
}

function isUsableVideoId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value);
}

function playbackIdsFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://music.youtube.com' || url.pathname !== '/watch') return null;
    const videoId = url.searchParams.get('v') || '';
    if (!isUsableVideoId(videoId)) return null;
    const list = url.searchParams.get('list') || '';
    const match = list.match(/^RDAMVM([a-zA-Z0-9_-]{11})$/);
    return { videoId, requestedId: match?.[1] || '' };
  } catch { return null; }
}

function playbackStateFromUrl(value, documentTitle = '') {
  const ids = playbackIdsFromUrl(value);
  const title = titleFromDocument(documentTitle);
  // A document title may remain after the player has returned to its home
  // page. Only a watch URL proves that this fallback represents a song.
  if (!ids) return null;
  const videoId = ids?.videoId || '';
  return {
    player: { hasSong: true, isPaused: false, trackState: 1, volume: 50, videoProgress: 0, duration: 0, durationSeconds: 0, adPlaying: false },
    video: { title, author: '', id: videoId, requestedId: ids?.requestedId || '', cover: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '', duration: 0, durationSeconds: 0 }
  };
}

function playbackStateFromTimeline(timeline) {
  if (!timeline || typeof timeline !== 'object') return null;
  const title = String(timeline.title || '').trim();
  if (!title) return null;
  const id = isUsableVideoId(timeline.id) ? timeline.id : '';
  if (!id && !(Number(timeline.duration) > 0 || Number(timeline.progress) > 0)) return null;
  return playbackStateFromUrl(
    id ? `https://music.youtube.com/watch?v=${id}` : 'https://music.youtube.com/',
    `${title} | YouTube Music`
  ) || {
    player: { hasSong: true, isPaused: Boolean(timeline.isPaused), trackState: timeline.isPaused ? 2 : 1, volume: 50, videoProgress: 0, duration: 0, durationSeconds: 0, adPlaying: false },
    video: { title, author: String(timeline.author || ''), id: '', requestedId: '', cover: String(timeline.cover || ''), duration: 0, durationSeconds: 0 }
  };
}

function normalizedIdentity(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function timelineBelongsToState(state, timeline) {
  if (!state?.video || !timeline || typeof timeline !== 'object') return true;
  const stateId = isUsableVideoId(state.video.id) ? state.video.id : '';
  const timelineId = isUsableVideoId(timeline.id) ? timeline.id : '';
  if (stateId && timelineId) return stateId === timelineId;
  const stateTitle = normalizedIdentity(state.video.title);
  const timelineTitle = normalizedIdentity(timeline.title);
  if (stateTitle && timelineTitle) return stateTitle === timelineTitle;
  return true;
}

function mergePlaybackTimeline(state, timeline) {
  if (!timeline || typeof timeline !== 'object') return state;
  state ||= playbackStateFromTimeline(timeline);
  if (!state) return null;
  // During a SPA track transition Media Session, the video element and the
  // document title can update in different frames. Never attach an old
  if (!timelineBelongsToState(state, timeline)) return state;
  const rawProgress = Number.isFinite(timeline.progress) && timeline.progress >= 0 ? Math.round(timeline.progress) : state.player.videoProgress;
  let duration = state.player.duration > 0 ? state.player.duration : 0;
  if (Number.isFinite(timeline.duration) && timeline.duration > 0) {
    if (duration <= 0 || Math.abs(timeline.duration - duration) <= 2) {
      duration = Math.round(timeline.duration);
    }
  }
  const progress = duration > 0 ? Math.min(rawProgress, duration) : rawProgress;
  const volume = Number.isFinite(timeline.volume) ? Math.max(0, Math.min(100, Math.round(timeline.volume))) : state.player.volume;
  const isPaused = typeof timeline.isPaused === 'boolean' ? timeline.isPaused : state.player.isPaused;
  const video = state.video ? {
    ...state.video,
    title: timeline.title || state.video.title,
    author: timeline.author || state.video.author,
    cover: timeline.cover || state.video.cover,
    duration,
    durationSeconds: duration
  } : null;
  return {
    ...state,
    player: { ...state.player, isPaused, trackState: isPaused ? 2 : 1, volume, videoProgress: progress, duration, durationSeconds: duration },
    video
  };
}

module.exports = { isUsableVideoId, mergePlaybackTimeline, playbackIdsFromUrl, playbackStateFromTimeline, playbackStateFromUrl, timelineBelongsToState, titleFromDocument };
