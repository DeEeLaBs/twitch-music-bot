import React, { Suspense, lazy, useCallback, useEffect, useState, useRef } from 'react';
import { Activity, AlertTriangle, Headphones, Loader2, MessageSquare, Music2, PanelTopOpen, Settings, Tv, Play, SlidersHorizontal, GripVertical, Sparkles, X } from 'lucide-react';
import type { BadgeType, BotConfig } from './types.ts';
import { BOT_QUOTES, getRandomQuoteIndex } from './quotes.ts';
import { NowPlayingCard } from './components/NowPlayingCard.tsx';
import { StreamPlaylistPanel } from './components/StreamPlaylistPanel.tsx';
import { QueueList } from './components/QueueList.tsx';
import { localizeBackendMessage, useTranslations } from './translations.ts';
import { ChatSimulator } from './components/ChatSimulator.tsx';
import { OverlayWidget } from './components/OverlayWidget.tsx';
import { ObsPlayerDock } from './components/ObsPlayerDock.tsx';
import { parseOverlayOptions } from './overlayOptions.ts';
import { parseDockOptions } from './dockOptions.ts';
import { apiFetch } from './apiClient.ts';
import { useBotState } from './hooks/useBotState.ts';
import { useStreamerAvatar } from './hooks/useStreamerAvatar.ts';

const CommandRulesStudio = lazy(() => import('./components/CommandRulesStudio.tsx').then(m => ({ default: m.CommandRulesStudio })));
const OverlayStudio = lazy(() => import('./components/OverlayStudio.tsx').then(m=>({default:m.OverlayStudio})));
const SetupGuide = lazy(() => import('./components/SetupGuide.tsx').then(m=>({default:m.SetupGuide})));
const DiagnosticsPanel = lazy(() => import('./components/DiagnosticsPanel.tsx').then(m=>({default:m.DiagnosticsPanel})));
const ObsDockStudio = lazy(() => import('./components/ObsDockStudio.tsx').then(m => ({ default: m.ObsDockStudio || m.default })));
const LazyFallback=()=> <div className="p-6 text-sm text-neutral-400">Loading…</div>;

type TabErrorBoundaryProps = { name: string; children: React.ReactNode };
type TabErrorBoundaryState = { error: string | null };

class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  declare props: Readonly<TabErrorBoundaryProps>;
  state: TabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(err: unknown): TabErrorBoundaryState {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state?.error) {
      const en = document.documentElement.lang === 'en';
      return (
        <div className="bg-neutral-900 border border-red-500/40 rounded-2xl p-6 space-y-3">
          <h3 className="text-base font-bold text-red-300">{en ? 'Failed to load' : 'Fehler beim Laden von'} {this.props.name}</h3>
          <p className="text-xs text-neutral-400">{en ? 'This tab could not be loaded because of an error:' : 'Dieser Tab konnte aufgrund eines Fehlers nicht geladen werden:'}</p>
          <pre className="text-xs bg-neutral-950 p-3 rounded-lg text-red-400 font-mono overflow-auto">{this.state?.error}</pre>
          <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
            {en ? 'Reload interface' : 'Oberfläche neu laden'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppTab = 'player' | 'webPlayer' | 'commands' | 'chat' | 'overlay' | 'obsDock' | 'diagnostics' | 'settings';

const DEFAULT_TAB_ORDER: AppTab[] = [
  'player',
  'webPlayer',
  'commands',
  'chat',
  'overlay',
  'obsDock',
  'diagnostics',
  'settings'
];

function sanitizeTabOrder(raw: unknown): AppTab[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TAB_ORDER];
  const valid = raw.filter((id): id is AppTab => id !== 'blacklist' && DEFAULT_TAB_ORDER.includes(id as AppTab));
  for (const defaultTab of DEFAULT_TAB_ORDER) {
    if (!valid.includes(defaultTab)) {
      valid.push(defaultTab);
    }
  }
  return valid;
}

// The desktop main process supplies a Chrome-only user agent matching its
// actual Chromium runtime. Do not pin an old browser version here: Google
// rejects stale/spoofed versions during sign-in.

const WebviewContainer = ({ 
  id,
  src, 
  useragent,
  visible,
  onReloadRef,
  onUserSkip
}: { 
  id?: string;
  src: string; 
  useragent?: string; 
  visible: boolean;
  onReloadRef?: React.MutableRefObject<(() => void) | null>;
  onUserSkip?: () => void;
}) => {
  const webviewHostRef = useRef<HTMLDivElement>(null);
  const wvRef = useRef<any>(null);
  const skipRef = useRef(onUserSkip);
  skipRef.current = onUserSkip;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  useEffect(() => {
    if (!webviewHostRef.current) return;
    const wv = document.createElement('webview') as any;
    wvRef.current = wv;
    if (id) wv.id = id;
    wv.setAttribute('src', src);
    // Use a persistent partition so cache and cookies are saved across restarts, drastically speeding up load times
    wv.setAttribute('partition', 'persist:musicbot');
    wv.setAttribute('webpreferences', 'backgroundThrottling=false,autoplayPolicy=no-user-gesture-required');
    if (useragent) wv.setAttribute('useragent', useragent);
    wv.setAttribute('allowpopups', 'true');
    wv.style.position = 'absolute';
    wv.style.top = '0';
    wv.style.left = '0';
    wv.style.width = '100%';
    wv.style.height = '100%';
    wv.style.border = 'none';
    wv.style.background = '#09090b';
    
    let disposed = false;
    let navigationFailed = false;
    let readyFrame = 0;
    const cancelReadyFrame = () => cancelAnimationFrame(readyFrame);
    interface WebviewNavigationEvent extends Event {
      isMainFrame?: boolean;
      isInPlace?: boolean;
    }
    interface WebviewFailLoadEvent extends Event {
      errorCode?: number;
      errorDescription?: string;
      isMainFrame?: boolean;
    }
    interface WebviewIpcMessageEvent extends Event {
      channel: string;
      args?: unknown[];
    }

    const handleNavigation = (event: Event) => {
      const navEvent = event as WebviewNavigationEvent;
      // Only a new main document needs an opaque loader. SPA navigation and
      // background resource loading must keep the existing player visible.
      if (!navEvent.isMainFrame || navEvent.isInPlace) return;
      cancelReadyFrame();
      navigationFailed = false;
      setLoading(true);
      setLoadError('');
    };
    const handleLoadReady = () => {
      if (navigationFailed) return;
      cancelReadyFrame();
      // Uncover the document without waiting for images and other late resources.
      readyFrame = requestAnimationFrame(() => {
        readyFrame = requestAnimationFrame(() => {
          if (!disposed) {
            setLoadError('');
            setLoading(false);
          }
        });
      });
    };
    const handleLoadFailure = (event: Event | { errorCode?: number; errorDescription?: string; isMainFrame?: boolean }) => {
      const failEvent = event as WebviewFailLoadEvent;
      // Chromium reports aborted redirects as ERR_ABORTED although navigation
      // continues normally. Do not turn those into a persistent error screen.
      if (failEvent?.errorCode === -3 || failEvent?.isMainFrame === false) return;
      cancelReadyFrame();
      navigationFailed = true;
      setLoading(false);
      setLoadError(failEvent?.errorDescription || 'Web Player konnte nicht geladen werden.');
    };
    wv.addEventListener('did-start-navigation', handleNavigation);
    const handleContentReady = (event: Event) => {
      const ipcEvent = event as WebviewIpcMessageEvent;
      if (ipcEvent.channel === 'player-content-ready') handleLoadReady();
      if (ipcEvent.channel === 'player-content-timeout') handleLoadFailure({
        errorDescription: 'Die Player-Oberfläche antwortet nicht. Bitte den Player neu laden.'
      });
      if (ipcEvent.channel === 'player-user-skip') {
        skipRef.current?.();
      }
    };
    wv.addEventListener('ipc-message', handleContentReady);
    wv.addEventListener('did-fail-load', handleLoadFailure);
    // Install listeners before attachment so fast cached loads cannot be missed.
    setLoading(true);
    setLoadError('');
    webviewHostRef.current.appendChild(wv);

    if (onReloadRef) {
      onReloadRef.current = () => {
        try {
          const currentUrl = wv.getURL ? wv.getURL() : '';
          if (currentUrl.includes('accounts.google.com') || currentUrl.includes('accounts.youtube.com')) {
            wv.loadURL('https://music.youtube.com/');
          } else {
            wv.reload();
          }
        } catch {
          try { wv.reload(); } catch {}
        }
      };
    }
    
    return () => {
      disposed = true;
      cancelReadyFrame();
      if (onReloadRef) onReloadRef.current = null;
      try {
        wv.removeEventListener('did-start-navigation', handleNavigation);
        wv.removeEventListener('ipc-message', handleContentReady);
        wv.removeEventListener('did-fail-load', handleLoadFailure);
        wv.remove();
      } catch {}
      wvRef.current = null;
    };
  }, [src, useragent, id]);

  useEffect(() => {
    if (!visible || !wvRef.current) return;
    // A webview which was covered by another tab can have a stale/black
    // compositor surface. Invalidating it makes the already loaded page paint
    // immediately instead of waiting for its next animation or input event.
    requestAnimationFrame(() => {
      try { wvRef.current.send('player-visible'); } catch {}
    });
  }, [visible]);

  return (
    <div 
      style={{ 
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        opacity: visible ? 1 : 0, 
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: visible ? 10 : 0,
        background: '#09090b'
      }}
    >
      {/* Keep the imperative Electron element in its own React-owned host.
          Otherwise rendering the loader can reconcile the webview away. */}
      <div ref={webviewHostRef} className="absolute inset-0" />
      {visible && (loading || loadError) && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-neutral-950 text-neutral-300">
          <div className="flex flex-col items-center gap-3 text-sm">
            {loading ? <Loader2 className="w-7 h-7 animate-spin text-purple-400" /> : <AlertTriangle className="w-7 h-7 text-amber-400" />}
            <span>{loading ? 'Web Player wird geladen…' : loadError}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  // Check if this window is the dedicated OBS overlay route
  const isOverlayRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/overlay');
  const isObsDockRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/dock/player');
  const isObsRoute = isOverlayRoute || isObsDockRoute;

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window === 'undefined') return 'player';
    const req = new URLSearchParams(window.location.search).get('tab');
    if (req === 'blacklist') return 'commands';
    if (req) return req === 'spotify' ? 'settings' : (req as AppTab);
    const saved = sessionStorage.getItem('musicbot_activeTab');
    if (saved === 'blacklist') return 'commands';
    return saved === 'spotify' ? 'settings' : (saved as AppTab) || 'player';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('musicbot_activeTab', activeTab);
    }
  }, [activeTab]);

  const { state, loading, connectionLost, initialError } = useBotState();
  const [error, setError] = useState<string | null>(null);
  const streamerAvatar = useStreamerAvatar(state?.config?.twitchChannel, !isObsRoute);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  useEffect(() => setAvatarLoadFailed(false), [streamerAvatar]);
  useEffect(() => {
    if (!avatarLoadFailed) return;
    const retry = window.setTimeout(() => setAvatarLoadFailed(false), 30_000);
    return () => window.clearTimeout(retry);
  }, [avatarLoadFailed]);

  // Parse query params for overlay route
  const overlayOptions = parseOverlayOptions(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''));
  const dockOptions = parseDockOptions(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''));

  useEffect(() => {
    document.documentElement.lang = state?.config.language === 'de' ? 'de' : 'en';
  }, [state?.config.language]);


  // OBS Overlay view (renders exclusively without UI when accessed at /overlay)
  if (isOverlayRoute) {
    const hasExplicitQuery = typeof window !== 'undefined' && window.location.search.length > 1;
    const initialOverlayOptions = (!hasExplicitQuery && state?.activeOverlay) ? state.activeOverlay : overlayOptions;
    return (
      <div className="w-full h-full bg-transparent overflow-hidden flex items-start justify-start m-0 p-0">
        <OverlayWidget playback={state?.playback} options={initialOverlayOptions} language={(state?.config.language as 'de' | 'en') || 'en'} disableInternalWs />
      </div>
    );
  }

  // Dedicated OBS Custom Browser Dock: compact YTM-style player bar without dashboard chrome.
  if (isObsDockRoute) {
    return (
      <div className="obs-dock-route">
        <ObsPlayerDock playback={state?.playback} queue={state?.queue || []} language={(state?.config.language as 'de' | 'en') || 'en'} options={dockOptions} connectionLost={connectionLost} />
      </div>
    );
  }

  const api = useCallback(async (url: string, options: RequestInit = {}) => {
    try {
      const response = await apiFetch(url, options);
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || result.message || 'Action failed.');
      setError(null); return result;
    } catch (err) { const message = err instanceof Error ? err.message : 'Bot is not reachable.'; setError(message); throw err; }
  }, []);

  // Memoized action handlers
  const handlePlayPause = useCallback(async () => {
    try { await api('/api/playback/play-pause', { method: 'POST' }); } catch {}
  }, [api]);

  const handleSkip = useCallback(async () => {
    try {
      await api('/api/playback/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'Streamer' })
      });
    } catch {}
  }, [api]);

  const handlePrevious = useCallback(async () => {
    try { await api('/api/playback/previous', { method: 'POST' }); } catch {}
  }, [api]);

  const handleVolumeChange = useCallback(async (volume: number) => {
    await api('/api/playback/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume })
    });
  }, [api]);

  const handleVoteSkip = useCallback(async (user: string) => {
    try {
      await api('/api/queue/vote-skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user })
      });
    } catch {}
  }, [api]);

  const handleAddSong = useCallback(async (query: string, username: string, badge: BadgeType) => {
    return api('/api/song/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, username, badge })
    });
  }, [api]);

  const handleVeto = useCallback(async (trackId: string) => {
    try {
      await api('/api/queue/veto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId })
      });
    } catch {}
  }, [api]);

  const handleClearQueue = useCallback(async () => {
    try { await api('/api/queue/clear', { method: 'POST' }); } catch {}
  }, [api]);

  const handleMoveTrack = useCallback(async (trackId: string, newIndex: number) => {
    try { await api('/api/queue/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId, newIndex }) }); } catch {}
  }, [api]);

  const handleSimulateChat = useCallback(async (username: string, message: string, badge: BadgeType) => {
    try {
      await api('/api/simulate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, message, badge })
      });
    } catch {}
  }, [api]);

  const handleAddBlacklist = useCallback(async (term: string, type: 'keyword' | 'artist' | 'channel') => {
    try {
      await api('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, type, addedBy: 'Streamer' })
      });
    } catch {}
  }, [api]);

  const handleRemoveBlacklist = useCallback(async (id: string) => {
    try { await api(`/api/blacklist/${id}`, { method: 'DELETE' }); } catch {}
  }, [api]);

  const handleSaveConfig = useCallback(async (updated: Partial<BotConfig>) => {
    await api('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  }, [api]);

  const reloadYtmRef = useRef<(() => void) | null>(null);
  const reloadSpotifyRef = useRef<(() => void) | null>(null);

  const isWebPlayerActive = activeTab === 'webPlayer';
  const playbackProvider = state?.config?.playbackProvider || 'youtube_music';

  const [mountedYtm, setMountedYtm] = useState(false);
  const [mountedSpotify, setMountedSpotify] = useState(false);

  useEffect(() => {
    // The default provider is only a UI fallback until the saved state arrives.
    // Keep previously used players mounted when switching to preserve playback.
    if (!state || isObsRoute) return;
    if (playbackProvider === 'youtube_music') setMountedYtm(true);
    if (playbackProvider === 'spotify') setMountedSpotify(true);
  }, [playbackProvider, Boolean(state), isObsRoute]);

  const webplayers = (
    <div 
      id="panel-webPlayer" 
      role="tabpanel" 
      aria-labelledby="tab-webPlayer" 
      className={`w-full flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl ${
        isWebPlayerActive 
          ? 'relative opacity-100 z-10' 
          : 'fixed inset-0 pointer-events-none opacity-0 -z-50'
      }`} 
      style={{ 
        minHeight: '600px', 
        height: 'calc(100vh - 180px)',
        width: '100%',
      }}
    >
      <div className="flex-1 w-full relative bg-black overflow-hidden">
        {mountedYtm && (
          <WebviewContainer 
              key="ytm-player"
              id="ytm-webview"
              src="https://music.youtube.com" 
              visible={isWebPlayerActive && playbackProvider === 'youtube_music'}
              onReloadRef={reloadYtmRef}
          />
        )}
        {mountedSpotify && (
          <WebviewContainer 
              key="spotify-player"
              id="spotify-webview"
              src="https://open.spotify.com" 
              visible={isWebPlayerActive && playbackProvider === 'spotify'}
              onReloadRef={reloadSpotifyRef}
              onUserSkip={handleSkip}
          />
        )}
      </div>
    </div>
  );

  const isYtmConnected = Boolean(state?.config?.companionConnected);
  const language = ((state?.config?.language as 'de' | 'en')) || 'de';
  const t = useTranslations(language);

  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const [isNoticePaused, setIsNoticePaused] = useState(false);

  const rawNotice = error || state?.playback?.error;
  const isPlaybackLoading = state?.playback?.status === 'loading';
  const activeNoticeText = connectionLost
    ? t('connectionLost')
    : rawNotice
      ? localizeBackendMessage(rawNotice, language as 'de' | 'en')
      : isPlaybackLoading
        ? t('trackLoading')
        : '';

  const lastNoticeRef = useRef<string>('');
  useEffect(() => {
    if (activeNoticeText && activeNoticeText !== lastNoticeRef.current) {
      lastNoticeRef.current = activeNoticeText;
      setDismissedNotice(null);
    } else if (!activeNoticeText) {
      lastNoticeRef.current = '';
    }
  }, [activeNoticeText]);

  const handleDismissNotice = useCallback(() => {
    if (activeNoticeText) {
      setDismissedNotice(activeNoticeText);
    }
    setError(null);
    void apiFetch('/api/playback/clear-error', { method: 'POST' }).catch(() => {});
  }, [activeNoticeText]);

  useEffect(() => {
    if (!activeNoticeText || connectionLost || isPlaybackLoading) return;
    if (activeNoticeText === dismissedNotice || isNoticePaused) return;

    const timer = window.setTimeout(handleDismissNotice, 6000);
    return () => window.clearTimeout(timer);
  }, [activeNoticeText, connectionLost, isPlaybackLoading, dismissedNotice, isNoticePaused, handleDismissNotice]);
  const isTwitchConnected = Boolean(state?.config?.twitchConnected);
  const isSpotifyConnected = Boolean(state?.config?.spotifyConnected);
  const isSpotifyPremium = Boolean(state?.config?.spotifyPremium);
  const channelName = state?.config?.twitchChannel?.replace(/^#/, '').trim();
  const botTitle = isTwitchConnected && channelName ? channelName + "'s Music Bot" : 'Music Bot';

  const [quoteIndex, setQuoteIndex] = useState(() => getRandomQuoteIndex());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setQuoteIndex(prev => (prev + 1) % BOT_QUOTES.length);
    }, 22000);
    return () => clearInterval(timer);
  }, []);

  const activeQuote = BOT_QUOTES[quoteIndex] || BOT_QUOTES[0];
  const quoteText = language === 'de' ? activeQuote.de : activeQuote.en;

  const [tabOrder, setTabOrder] = useState<AppTab[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('musicbot_tabOrder');
        if (saved) return sanitizeTabOrder(JSON.parse(saved));
      } catch {}
    }
    return [...DEFAULT_TAB_ORDER];
  });

  const [draggedTab, setDraggedTab] = useState<AppTab | null>(null);
  const [dragOverTab, setDragOverTab] = useState<AppTab | null>(null);
  const dragOccurredRef = useRef(false);

  useEffect(() => {
    if (state?.config?.tabOrder && Array.isArray(state.config.tabOrder)) {
      const sanitized = sanitizeTabOrder(state.config.tabOrder);
      setTabOrder(prev => {
        if (JSON.stringify(prev) === JSON.stringify(sanitized)) return prev;
        return sanitized;
      });
    }
  }, [state?.config?.tabOrder]);

  const updateTabOrder = useCallback((newOrder: AppTab[]) => {
    const sanitized = sanitizeTabOrder(newOrder);
    setTabOrder(sanitized);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('musicbot_tabOrder', JSON.stringify(sanitized));
      } catch {}
    }
    void handleSaveConfig({ tabOrder: sanitized }).catch(() => {});
  }, [handleSaveConfig]);

  const handleDragStart = (e: React.DragEvent, id: AppTab) => {
    dragOccurredRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggedTab(id);
    setTimeout(() => {
      dragOccurredRef.current = true;
    }, 50);
  };

  const handleDragOver = (e: React.DragEvent, id: AppTab) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTab !== id) {
      setDragOverTab(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: AppTab) => {
    e.preventDefault();
    setDragOverTab(null);
    if (draggedTab && draggedTab !== targetId) {
      const fromIndex = tabOrder.indexOf(draggedTab);
      const toIndex = tabOrder.indexOf(targetId);
      if (fromIndex !== -1 && toIndex !== -1) {
        const newOrder = [...tabOrder];
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, draggedTab);
        updateTabOrder(newOrder);
      }
    }
    setDraggedTab(null);
    setTimeout(() => {
      dragOccurredRef.current = false;
    }, 100);
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
    setDragOverTab(null);
    setTimeout(() => {
      dragOccurredRef.current = false;
    }, 100);
  };

  const tabDefinitions: Record<AppTab, { label: string; icon: typeof Music2; count?: number }> = {
    player: { label: t('tabPlayer'), icon: Music2, count: state?.queue?.length || 0 },
    webPlayer: { label: 'Web Player', icon: Headphones },
    commands: { label: t('tabCommands'), icon: SlidersHorizontal },
    chat: { label: t('tabChat'), icon: MessageSquare },
    overlay: { label: t('tabOverlay'), icon: Tv },
    obsDock: { label: language === 'en' ? 'OBS Dock' : 'OBS Dock', icon: PanelTopOpen },
    diagnostics: { label: language === 'en' ? 'Diagnostics' : 'Diagnose', icon: Activity },
    settings: { label: 'Setup', icon: Settings },
  };

  const tabs = tabOrder
    .filter((id): id is AppTab => Boolean(tabDefinitions[id]))
    .map(id => ({ id, ...tabDefinitions[id] }));

  const handleTabKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const currentIndex = tabOrder.indexOf(activeTab);
      const targetIndex = event.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex >= 0 && targetIndex < tabOrder.length) {
        const newOrder = [...tabOrder];
        newOrder.splice(currentIndex, 1);
        newOrder.splice(targetIndex, 0, activeTab);
        updateTabOrder(newOrder);
      }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab.id === activeTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setActiveTab(tabs[next].id);
    window.requestAnimationFrame(() => document.getElementById(`tab-${tabs[next].id}`)?.focus());
  };

  return (
    <div className="bg-neutral-950 text-neutral-100 h-screen w-screen flex flex-col antialiased font-sans overflow-hidden relative">
      
      {(loading || !state) && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-sm font-medium text-neutral-400">{(initialError ? (document.documentElement.lang === 'en' ? 'Failed to connect to Bot API service.' : 'Verbindung zum Bot-Dienst fehlgeschlagen.') : error) || (document.documentElement.lang === 'en' ? 'Loading bot.' : 'Bot wird geladen.')}</span>
        </div>
      )}

      {/* Fixed Header & Nav Section */}
      <div className="flex-none p-4 pb-0 space-y-6">
        {/* Top Navigation & Status Bar */}
        <header className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 max-w-full">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-900/40 shrink-0">
              {streamerAvatar && !avatarLoadFailed ? (
                <img src={streamerAvatar} alt="" className="w-full h-full object-cover rounded-xl" onError={() => setAvatarLoadFailed(true)} />
              ) : (
                <Music2 className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white leading-tight">{botTitle}</h1>
              <button
                type="button"
                onClick={() => setQuoteIndex(prev => (prev + 1) % BOT_QUOTES.length)}
                className="group flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-neutral-400 hover:text-purple-300 transition-colors text-left cursor-pointer bg-transparent border-0 p-0 m-0 max-w-full"
                title={language === 'de' ? 'Klicken für ein weiteres Zitat / Spruch' : 'Click for another quote'}
              >
                <span className="italic min-w-0 whitespace-normal [overflow-wrap:anywhere]">{quoteText}</span>
                {activeQuote.origin && (
                  <span className="text-[10px] text-neutral-500 group-hover:text-purple-400 font-medium whitespace-normal [overflow-wrap:anywhere] transition-colors">
                    — {activeQuote.origin}
                  </span>
                )}
                <Sparkles className="w-3 h-3 text-purple-400/50 group-hover:text-purple-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                isYtmConnected
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white'
              }`}
              title={isYtmConnected ? t('ytmConnected') : t('ytmDisconnected')}
            >
              <span aria-hidden="true" className={`w-2 h-2 rounded-full ${isYtmConnected ? 'bg-red-400' : 'bg-neutral-500'} ${isYtmConnected && playbackProvider === 'youtube_music' ? 'animate-ping' : ''}`} />
              <span>YouTube Music: {isYtmConnected ? (state?.config.language === 'de' ? 'Verbunden' : 'Connected') : (state?.config.language === 'de' ? 'Getrennt' : 'Disconnected')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                isTwitchConnected
                  ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                  : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white'
              }`}
              title={isTwitchConnected ? (channelName ? `${t('twitchConnectedTitle')}: #${channelName}` : t('connected')) : t('twitchDisconnectedTitle')}
            >
              <span className={`w-2 h-2 rounded-full ${isTwitchConnected ? 'bg-purple-400' : 'bg-neutral-500'}`} />
              <span>Twitch: #{channelName || state?.config.twitchChannel || 'Streamer'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  isSpotifyConnected
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white'
                }`}
                title={isSpotifyConnected ? (isSpotifyPremium ? 'Spotify Premium' : t('spotifyConnected')) : t('spotifyDisconnected')}
              >
                <span aria-hidden="true" className={`w-2 h-2 rounded-full ${isSpotifyConnected ? 'bg-emerald-400' : 'bg-neutral-500'} ${isSpotifyConnected && playbackProvider === 'spotify' ? 'animate-ping' : ''}`} />
                <span>Spotify {isSpotifyPremium ? 'Premium' : isSpotifyConnected ? t('connected') : (language === 'de' ? 'Verbinden' : 'Connect')}</span>
              </button>
            </div>
          </header>

          {/* Interactive Tab Navigation with Drag & Drop reordering */}
          <nav className="flex gap-2 overflow-x-auto pb-1 text-sm border-b border-neutral-800/80 items-center" role="tablist" onKeyDown={handleTabKeys}>
            {tabs.map(({ id, label, icon: Icon, count }) => {
              const isActive = activeTab === id;
              const isBeingDragged = draggedTab === id;
              const isDropTarget = dragOverTab === id && draggedTab !== id;

              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, id)}
                  onDragOver={(e) => handleDragOver(e, id)}
                  onDrop={(e) => handleDrop(e, id)}
                  onDragEnd={handleDragEnd}
                  className={`group relative flex items-center transition-all select-none rounded-xl ${
                    isBeingDragged ? 'opacity-40 scale-95' : 'opacity-100'
                  } ${
                    isDropTarget ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-neutral-950 scale-105' : ''
                  }`}
                  title={language === 'de' ? `${label} (Verschiebbar: Ziehen zum Sortieren)` : `${label} (Movable: Drag to reorder)`}
                >
                  <button
                    id={`tab-${id}`}
                    type="button"
                    onClick={() => {
                      if (dragOccurredRef.current) return;
                      setActiveTab(id);
                    }}
                    className={`px-3.5 py-2 font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-grab active:cursor-grabbing whitespace-nowrap text-sm ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
                    }`}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-neutral-500/50 group-hover:text-neutral-300 transition-colors -ml-1 shrink-0" aria-hidden="true" />
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                    {typeof count === 'number' && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isActive ? 'bg-purple-800 text-purple-200' : 'bg-neutral-800 text-neutral-400'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </nav>

          {Boolean(activeNoticeText && (connectionLost || activeNoticeText !== dismissedNotice)) && (
            <div
              role="status"
              className="bg-amber-950/40 border border-amber-500/30 text-amber-200 p-3 rounded-xl text-xs flex items-center justify-between gap-2.5 transition-opacity duration-200 shadow-sm"
              onMouseEnter={() => setIsNoticePaused(true)}
              onMouseLeave={() => setIsNoticePaused(false)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">{activeNoticeText}</span>
              </div>
              {!connectionLost && (
                <button
                  type="button"
                  onClick={handleDismissNotice}
                  className="p-1 -mr-1 rounded-md text-amber-400/80 hover:text-amber-200 hover:bg-amber-500/20 transition-colors shrink-0"
                  aria-label={t('dismissNotice')}
                  title={t('dismissNotice')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Main Content Area */}
        <main id="main-content" className="flex-1 overflow-y-auto p-4 flex flex-col space-y-6" tabIndex={-1}>
            {webplayers}
            
            {(!loading && state) && (
              <>
              {/* TAB 1: PLAYER & QUEUE DASHBOARD (1:1 from preview.html) */}
              {activeTab === 'player' && (
                <div id="view-dashboard" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column (5 cols): Now Playing Card + Quick Start */}
                  <div className="lg:col-span-5 space-y-4">
                <NowPlayingCard
                  language={state?.config.language as 'de' | 'en'}
                  playback={state?.playback}
                  voteSkip={state?.voteSkip}
                  onPlayPause={handlePlayPause}
                  onSkip={handleSkip}
                  onPrevious={handlePrevious}
                  onVolumeChange={handleVolumeChange}
                  onVoteSkip={handleVoteSkip}
                />

                {/* Quick Start Next Request Button (1:1 from preview.html) */}
                <button
                  disabled={state?.playback.status === 'loading' || !state?.queue.length || (playbackProvider === 'youtube_music' && !isYtmConnected) || (playbackProvider === 'spotify' && !isSpotifyConnected)}
                  type="button"
                  onClick={() => { void api('/api/queue/start', { method: 'POST' }).catch(() => {}); }}
                  className="w-full py-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-purple-500/50 hover:bg-neutral-850 text-neutral-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
                >
                  <Play className="w-4 h-4 text-purple-400" />
                  <span>{language === 'de' ? 'Nächsten Request in der Warteschlange abspielen' : t('startNextRequest')}</span>
                </button>
              </div>

              {/* Right Column (7 cols): Queue List */}
              <div className="lg:col-span-7 h-full">
                <QueueList
                  language={state?.config.language as 'de' | 'en'}
                  queue={state?.queue}
                  onAddSong={handleAddSong}
                  onVeto={handleVeto}
                  onClearQueue={handleClearQueue}
                  onMove={handleMoveTrack}
                />
              </div>
            </div>
          )}

          {activeTab === 'player' && <StreamPlaylistPanel config={state.config} />}

          {activeTab === 'commands' && (
            <div id="panel-commands" role="tabpanel" aria-labelledby="tab-commands">
              <TabErrorBoundary name="Commands & Rules">
                <Suspense fallback={<LazyFallback/>}>
                  <CommandRulesStudio
                    config={state.config}
                    language={language as 'de' | 'en'}
                    blacklist={state.blacklist || []}
                    onAddBlacklistRule={handleAddBlacklist}
                    onRemoveBlacklistRule={handleRemoveBlacklist}
                    onSaveConfig={handleSaveConfig}
                    onNavigateToChat={() => setActiveTab('chat')}
                  />
                </Suspense>
              </TabErrorBoundary>
            </div>
          )}

          {activeTab === 'chat' && (
            <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat"><ChatSimulator logs={state?.logs} onSendMessage={handleSimulateChat} language={state?.config.language} /></div>
          )}

          {activeTab === 'overlay' && (
            <div id="panel-overlay" role="tabpanel" aria-labelledby="tab-overlay"><Suspense fallback={<LazyFallback/>}><OverlayStudio language={state?.config.language as 'de' | 'en'} playback={state?.playback} /></Suspense></div>
          )}

          {activeTab === 'obsDock' && (
            <div id="panel-obsDock" role="tabpanel" aria-labelledby="tab-obsDock">
              <TabErrorBoundary name="OBS Dock">
                <Suspense fallback={<LazyFallback/>}>
                  <ObsDockStudio language={state?.config.language as 'de' | 'en'} playback={state?.playback} queue={state?.queue || []} />
                </Suspense>
              </TabErrorBoundary>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div id="panel-diagnostics" role="tabpanel" aria-labelledby="tab-diagnostics">
              <Suspense fallback={<LazyFallback/>}><DiagnosticsPanel language={state?.config.language as 'de' | 'en'} /></Suspense>
            </div>
          )}

          <div hidden={activeTab !== 'settings'}>
            <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings"><Suspense fallback={<LazyFallback/>}><SetupGuide
              config={state?.config}
              pairingState={state?.pairing}
              onSaveConfig={handleSaveConfig}
            /></Suspense></div>
          </div>
          </>
        )}
      </main>

      {/* Footer */}
      {(!loading && state) && (state?.error || !isTwitchConnected || (state?.config?.playbackProvider === 'youtube_music' && !isYtmConnected) || (state?.config?.playbackProvider === 'spotify' && !isSpotifyConnected)) && (
        <footer className="flex-none bg-neutral-900/50 border border-neutral-800/60 rounded-xl p-3.5 mx-4 mb-4 text-xs text-neutral-400 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>
              {navigator.userAgent.toLowerCase().includes('electron') 
                ? (state?.config?.language === 'de' ? 'Achtung: Es fehlen noch Verbindungen (Twitch, YTM oder Spotify), damit der Bot funktioniert!' : 'Warning: Missing connections (Twitch, YTM or Spotify) for the bot to work!')
                : (state?.config?.language === 'de' ? 'Dashboard im Browser. Bitte das Hauptprogramm (Electron) nicht schließen! Es fehlen noch Verbindungen.' : 'Dashboard in Browser. Do not close the main program! Missing connections.')}
            </span>
          </div>
          <div className="text-neutral-500 font-mono">v1.8.5 • Electron Edition</div>
        </footer>
      )}
    </div>
  );
}
