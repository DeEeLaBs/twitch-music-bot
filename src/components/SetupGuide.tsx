import React, { useState, useEffect, useRef } from 'react';
import {
  Check, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Headphones, Music2, LogIn, ExternalLink, HelpCircle, ChevronDown, ChevronUp,
  Sparkles, Coins, Key, Copy, Radio, Save, Globe
} from 'lucide-react';
import type { BotConfig, TwitchChannelPointReward, YtmPairingState } from '../types.ts';
import { YtmPairingWizard } from './YtmPairingWizard.tsx';
import { useTranslations } from '../translations.ts';

import { ChannelPointsSettings } from './ChannelPointsSettings.tsx';
import { StreamDeckSetupCard } from './StreamDeckSetupCard.tsx';
import { apiFetch, primeConfigSession, sendConfigOnExit } from '../apiClient.ts';

interface SetupGuideProps {
  config: BotConfig;
  pairingState?: YtmPairingState;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
}

export const SetupGuide: React.FC<SetupGuideProps> = ({ config, pairingState, onSaveConfig }) => {
  const [formData, setFormData] = useState({
    channelPointsRewardId: config.channelPointsRewardId || '',
    twitchChannel: config.twitchChannel,
    twitchBotUsername: config.twitchBotUsername,
    twitchClientId: config.twitchClientId || '',
    twitchClientSecret: config.twitchClientSecret || '',
    twitchBotOauthToken: config.twitchBotOauthToken,
    ytmdaCompanionUrl: config.ytmdaCompanionUrl,
    ytmdaAuthToken: config.ytmdaAuthToken,
    spotifyClientId: config.spotifyClientId || '',
    spotifyFallbackPlaylist: config.spotifyFallbackPlaylist || '',
    streamPlaylistUrl: config.streamPlaylistUrl || '',
    playbackProvider: config.playbackProvider || 'youtube_music',
    spotifyFallbackToYtm: config.spotifyFallbackToYtm !== false,
    maxSongDurationMinutes: Math.round((config.maxSongDurationSeconds || 420) / 60),
    maxActivePerViewer: config.maxActivePerViewer || 2,
    voteSkipThreshold: config.voteSkipThreshold || 3,
    simulationMode: config.simulationMode || false,
    language: config.language || 'en'
  });
  const previousFormRef = useRef(formData);
  const formChangeRef = useRef(false);
  const pendingPatchRef = useRef<Partial<BotConfig>>({});
  const autoSaveTimerRef = useRef<number | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const [showTwitchGuide, setShowTwitchGuide] = useState(false);
  const [showOwnTwitchApp, setShowOwnTwitchApp] = useState(false);
  // With the bundled Twitch app there is nothing to register: hide Client ID/Secret behind "Advanced".
  const simpleTwitchLogin = Boolean(config.twitchBuiltInAppAvailable && config.twitchUsesBuiltInApp) && !showOwnTwitchApp;
  const [showSpotifyGuide, setShowSpotifyGuide] = useState(false);
  const [twitchAuthMode, setTwitchAuthMode] = useState<'device' | 'manual'>(() => {
    return (config.twitchTokenConfigured && !config.twitchClientId) ? 'manual' : 'device';
  });
  const [copiedUserCode, setCopiedUserCode] = useState(false);

  const copyUserCode = () => {
    if (twitchOAuth.userCode) {
      void navigator.clipboard.writeText(twitchOAuth.userCode);
      setCopiedUserCode(true);
      setTimeout(() => setCopiedUserCode(false), 2000);
    }
  };

  useEffect(() => {
    if (config.ytmdaAuthToken !== formData.ytmdaAuthToken) {
      setFormData(prev => ({ ...prev, ytmdaAuthToken: config.ytmdaAuthToken }));
    }
  }, [config.ytmdaAuthToken]);

  useEffect(() => {
    setFormData(prev => {
      let changed = false;
      const next = { ...prev };
      if (config.twitchChannel && config.twitchChannel !== prev.twitchChannel && !formChangeRef.current) {
        next.twitchChannel = config.twitchChannel;
        changed = true;
      }
      if (config.twitchBotUsername && config.twitchBotUsername !== prev.twitchBotUsername && !formChangeRef.current) {
        next.twitchBotUsername = config.twitchBotUsername;
        changed = true;
      }
      if (config.twitchClientId && config.twitchClientId !== prev.twitchClientId && !formChangeRef.current) {
        next.twitchClientId = config.twitchClientId;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [config.twitchChannel, config.twitchBotUsername, config.twitchClientId]);

  const t = useTranslations((formData.language as 'de' | 'en') || 'en');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [channelPointsEnabled, setChannelPointsEnabled] = useState(config.channelPointsEnabled ?? Boolean(config.channelPointsRewardId));
  const [rewards, setRewards] = useState<TwitchChannelPointReward[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [rewardsError, setRewardsError] = useState('');
  const [spotifyStatus, setSpotifyStatus] = useState<any>(null);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotifySuccess, setSpotifySuccess] = useState('');
  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const [isStartingGoogleLogin, setIsStartingGoogleLogin] = useState(false);
  const [googleAuthenticated, setGoogleAuthenticated] = useState(false);
  const [embeddedYtmPlayer, setEmbeddedYtmPlayer] = useState<boolean | null>(null);
  const [googleLoginMessage, setGoogleLoginMessage] = useState('');
  const [googleLoginError, setGoogleLoginError] = useState('');
  const [twitchOAuth, setTwitchOAuth] = useState<{state:string;userCode?:string;verificationUri?:string;login?:string;error?:string}>({state:'idle'});
  const twitchOAuthError = (status: number, fallback: string) => status === 404
    ? (formData.language === 'de'
      ? 'Der laufende Bot-Server ist noch auf dem alten Stand. Beende den Bot vollständig und starte ihn neu.'
      : 'The running bot server is outdated. Fully quit and restart the bot.')
    : fallback;
  useEffect(() => {
    void fetch('/api/twitch/oauth/status').then(async response => {
      if (response.status === 404) throw new Error(twitchOAuthError(404, ''));
      if (!response.ok) throw new Error('Twitch-Status konnte nicht geladen werden.');
      return response.json();
    }).then(status => {
      if (status?.state) setTwitchOAuth(status);
    }).catch(error => setTwitchOAuth({state:'error',error:error instanceof Error?error.message:String(error)}));
  }, []);
  const connectPollTimerRef = useRef<number | null>(null);
  const googlePollTimerRef = useRef<number | null>(null);
  const googleFailuresRef = useRef(0);

  const loadGoogleAuthStatus = async (reportUnavailable = false) => {
    if (!reportUnavailable && !isStartingGoogleLogin && googleFailuresRef.current >= 4) {
      return false;
    }
    try {
      const response = await fetch('http://127.0.0.1:9863/api/v1/auth/google-status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        googleFailuresRef.current++;
        if (response.status === 404) {
          throw new Error(formData.language === 'de'
            ? 'Der laufende Desktop-Prozess ist noch auf dem alten Stand. Beende die App vollständig und starte sie neu; eine erneute Google-Anmeldung ist nicht erforderlich.'
            : 'The running desktop process is still outdated. Fully quit and restart the app; you do not need to sign in to Google again.');
        }
        throw new Error(payload.message || 'Google status failed');
      }
      googleFailuresRef.current = 0;
      setEmbeddedYtmPlayer(true);
      const authenticated = Boolean(payload.authenticated || payload.state === 'authenticated');
      setGoogleAuthenticated(authenticated);
      if (payload.state === 'authenticated') {
        setIsStartingGoogleLogin(false);
        setGoogleLoginError('');
        setGoogleLoginMessage(formData.language === 'de'
          ? `Google-Konto erfolgreich übernommen${payload.browser ? ` (${payload.browser})` : ''}. YouTube Music wurde neu geladen.`
          : `Google account imported successfully${payload.browser ? ` (${payload.browser})` : ''}. YouTube Music was reloaded.`);
        return true;
      }
      if (payload.state === 'error') {
        setIsStartingGoogleLogin(false);
        setGoogleLoginMessage('');
        setGoogleLoginError(payload.message || (formData.language === 'de' ? 'Die Google-Anmeldung ist fehlgeschlagen.' : 'Google sign-in failed.'));
        return true;
      }
      setIsStartingGoogleLogin(payload.state === 'running');
      return payload.state !== 'running';
    } catch (error) {
      googleFailuresRef.current++;
      setEmbeddedYtmPlayer(previous => previous === true ? true : false);
      // The status service exists only in the desktop application. Avoid a
      // misleading error while the Electron companion is still starting.
      if (reportUnavailable) {
        setIsStartingGoogleLogin(false);
        setGoogleLoginMessage('');
        setGoogleLoginError(error instanceof Error ? error.message : String(error));
        return true;
      }
      return false;
    }
  };

  const loadSpotifyStatus = async () => {
    try {
      const r = await fetch('/api/spotify/status');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || 'Spotify status failed');
      setSpotifyStatus(j);
      if (j.connected) {
        if (j.premium) {
          setSpotifySuccess(formData.language === 'de' ? `Mit Spotify verbunden! Account: "${j.accountName || 'Verbunden'}" (Premium aktiv)` : `Connected to Spotify! Account: "${j.accountName || 'Connected'}" (Premium active)`);
          setSpotifyError('');
        } else {
          setSpotifyError(formData.language === 'de' ? `Mit Spotify verbunden (${j.accountName || 'Account'}), aber dieser Account besitzt kein Spotify Premium!` : `Connected to Spotify (${j.accountName || 'Account'}), but this account does not have Spotify Premium!`);
        }
      } else if (j.lastError) {
        setSpotifyError(j.lastError);
      }
      return j;
    } catch (e) {
      setSpotifyError(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  useEffect(() => {
    void loadSpotifyStatus();
    void loadGoogleAuthStatus();
    const id = setInterval(() => {
      void loadSpotifyStatus();
      void loadGoogleAuthStatus();
    }, 4000);
    return () => {
      clearInterval(id);
      if (connectPollTimerRef.current) clearInterval(connectPollTimerRef.current);
      if (googlePollTimerRef.current) clearInterval(googlePollTimerRef.current);
    };
  }, []);

  const connectSpotify = async () => {
    const clientId = formData.spotifyClientId.trim();
    if (!clientId) {
      setSpotifyError(formData.language === 'de' ? 'Bitte trage zuerst deine Spotify Client ID ein.' : 'Please enter your Spotify Client ID first.');
      setSpotifySuccess('');
      return;
    }
    setSpotifyError('');
    setSpotifySuccess('');
    setIsConnectingSpotify(true);
    try {
      await onSaveConfig({
        spotifyClientId: clientId,
        playbackProvider: formData.playbackProvider,
        spotifyFallbackToYtm: formData.spotifyFallbackToYtm
      });
      window.open('/auth/spotify/login', '_blank', 'noopener,noreferrer');
      let attempts = 0;
      if (connectPollTimerRef.current) clearInterval(connectPollTimerRef.current);
      connectPollTimerRef.current = window.setInterval(async () => {
        attempts++;
        const s = await loadSpotifyStatus();
        if (s?.connected || attempts >= 45) {
          if (connectPollTimerRef.current) clearInterval(connectPollTimerRef.current);
          connectPollTimerRef.current = null;
          setIsConnectingSpotify(false);
          if (!s?.connected && attempts >= 45) {
            setSpotifyError(formData.language === 'de' ? 'Zeitüberschreitung: Die Autorisierung im Browser wurde nicht abgeschlossen.' : 'Timed out waiting for Spotify authorization in browser.');
          }
        }
      }, 1000);
    } catch (e) {
      setIsConnectingSpotify(false);
      setSpotifyError(e instanceof Error ? e.message : String(e));
    }
  };

  const resumeTwitchOAuth = async () => {
    try {
      const response = await apiFetch('/api/twitch/oauth/resume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSecret: formData.twitchClientSecret.trim() || undefined })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || 'Twitch reconnect failed.');
      setTwitchOAuth(result);
      setFormData(prev => ({ ...prev, twitchClientSecret: '' }));
    } catch (error) { setTwitchOAuth({ state: 'error', error: error instanceof Error ? error.message : String(error) }); }
  };

  const startTwitchOAuth = async () => {
    try {
      const clientId = formData.twitchClientId.trim();
      const clientSecret = formData.twitchClientSecret.trim() || undefined;
      const channel = formData.twitchChannel.trim();
      if (!clientId && !config.twitchBuiltInAppAvailable) throw new Error(formData.language === 'de'
        ? 'Bitte zuerst die Client-ID deiner Twitch-Anwendung eingeben.'
        : 'Please enter your Twitch application Client ID first.');

      // Channel und Client-Daten vor dem OAuth-Start speichern, damit der Bot sofort verbunden werden kann
      await onSaveConfig({
        twitchChannel: channel,
        twitchClientId: clientId,
        ...(clientSecret ? { twitchClientSecret: clientSecret } : {})
      });

      const response = await apiFetch('/api/twitch/oauth/start', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({clientId, clientSecret}) });
      const result = await response.json();
      if (!response.ok) throw new Error(twitchOAuthError(response.status, result.error || result.message || 'Twitch-Anmeldung konnte nicht gestartet werden.'));
      setTwitchOAuth(result);
      if (result.verificationUri) window.open(result.verificationUri, '_blank', 'noopener,noreferrer');
    } catch (error) { setTwitchOAuth({state:'error',error:error instanceof Error?error.message:String(error)}); }
  };

  useEffect(() => {
    if (twitchOAuth.state !== 'pending') return;
    const timer = window.setInterval(async () => {
      try {
        const response = await apiFetch('/api/twitch/oauth/poll', { method:'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(twitchOAuthError(response.status, result.error || result.message || 'Twitch-Anmeldung fehlgeschlagen.'));
        setTwitchOAuth(result);
        if (result.state === 'connected' && result.login) {
          formChangeRef.current = true;
          setFormData(prev => ({ ...prev, twitchBotUsername: result.login, twitchBotOauthToken: '' }));
        }
      } catch (error) { setTwitchOAuth({state:'error',error:error instanceof Error?error.message:String(error)}); }
    }, 5000);
    return () => clearInterval(timer);
  }, [twitchOAuth.state]);

  const disconnectSpotify = async () => {
    try {
      const r = await apiFetch('/api/spotify/disconnect', { method: 'POST' });
      if (!r.ok) throw new Error('Disconnect failed');
      setSpotifySuccess('');
      setSpotifyError('');
      await loadSpotifyStatus();
    } catch (e) {
      setSpotifyError(e instanceof Error ? e.message : String(e));
    }
  };

  const startGoogleLogin = async () => {
    if (isStartingGoogleLogin) return;
    googleFailuresRef.current = 0;
    setIsStartingGoogleLogin(true);
    setGoogleLoginMessage('');
    setGoogleLoginError('');
    try {
      const response = await fetch('http://127.0.0.1:9863/api/v1/auth/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switchAccount: googleAuthenticated })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || (formData.language === 'de' ? 'Die Google-Anmeldung konnte nicht gestartet werden.' : 'Google sign-in could not be started.'));
      }
      setGoogleLoginMessage(formData.language === 'de'
        ? 'Der sichere Browser ist geöffnet. Schließe ihn erst, nachdem die Google-Anmeldung abgeschlossen ist.'
        : 'The secure browser is open. Close it only after Google sign-in is complete.');
      if (googlePollTimerRef.current) clearInterval(googlePollTimerRef.current);
      googlePollTimerRef.current = window.setInterval(async () => {
        const finished = await loadGoogleAuthStatus(true);
        if (finished && googlePollTimerRef.current) {
          clearInterval(googlePollTimerRef.current);
          googlePollTimerRef.current = null;
        }
      }, 1000);
    } catch (error) {
      setGoogleLoginError(error instanceof Error ? error.message : String(error));
      setIsStartingGoogleLogin(false);
    }
  };

  useEffect(() => {
    setChannelPointsEnabled(config.channelPointsEnabled ?? Boolean(config.channelPointsRewardId));
    setFormData(prev => ({ ...prev, channelPointsRewardId: config.channelPointsRewardId || '' }));
  }, [config.channelPointsEnabled, config.channelPointsRewardId]);

  const fetchRewards = async () => {
    const response = await fetch('/api/twitch/channel-point-rewards');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || t('requestFailed'));
    setRewards(Array.isArray(payload.rewards) ? payload.rewards : []);
  };

  const loadRewards = async () => {
    if (rewardsLoading) return;
    setRewardsLoading(true);
    setRewardsError('');
    try {
      // Persist the Twitch fields currently visible in the form first. This makes
      // "Load rewards" work immediately after entering channel/token, without
      // requiring a separate save or a specific toggle order. Empty token means
      // "keep the stored token" on the server.
      await onSaveConfig({
        twitchChannel: formData.twitchChannel.trim(),
        twitchBotUsername: formData.twitchBotUsername.trim(),
        twitchBotOauthToken: formData.twitchBotOauthToken.trim(),
        channelPointsEnabled
      });
      await fetchRewards();
    } catch (error) {
      setRewards([]);
      setRewardsError(error instanceof Error ? error.message : t('requestFailed'));
    } finally {
      setRewardsLoading(false);
    }
  };

  const createReward = async () => {
    if(rewardsLoading) return; setRewardsLoading(true); setRewardsError('');
    try {
      await onSaveConfig({twitchChannel:formData.twitchChannel.trim(),twitchBotUsername:formData.twitchBotUsername.trim(),twitchBotOauthToken:formData.twitchBotOauthToken.trim(),channelPointsEnabled:true});
      const response=await apiFetch('/api/twitch/channel-point-rewards/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title: formData.language==='en'?'Request a song':'Song wünschen',cost:1000})});
      const payload=await response.json(); if(!response.ok||payload.success===false) throw new Error(payload.error||t('requestFailed'));
      if(payload.reward?.id){setFormData(prev=>({...prev,channelPointsRewardId:payload.reward.id}));setChannelPointsEnabled(true);} await fetchRewards();
    } catch(error){setRewardsError(error instanceof Error?error.message:t('requestFailed'));} finally {setRewardsLoading(false);}
  };

  const selectReward = async (channelPointsRewardId: string) => {
    setFormData(prev => ({ ...prev, channelPointsRewardId }));
    setRewardsError('');
    try {
      await onSaveConfig({ channelPointsEnabled, channelPointsRewardId });
    } catch (error) {
      setRewardsError(error instanceof Error ? error.message : t('saveFailed'));
    }
  };

  useEffect(() => {
    if (!channelPointsEnabled || !config.twitchTokenConfigured || !config.twitchChannel) return;
    let cancelled = false;
    setRewardsLoading(true);
    setRewardsError('');
    fetch('/api/twitch/channel-point-rewards')
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || t('requestFailed'));
        if (!cancelled) setRewards(Array.isArray(payload.rewards) ? payload.rewards : []);
      })
      .catch(error => {
        if (!cancelled) {
          setRewards([]);
          setRewardsError(error instanceof Error ? error.message : t('requestFailed'));
        }
      })
      .finally(() => { if (!cancelled) setRewardsLoading(false); });
    return () => { cancelled = true; };
  }, [channelPointsEnabled, config.twitchTokenConfigured, config.twitchChannel]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    pendingPatchRef.current = {};
    await saveChainRef.current.catch(() => {});
    try { await onSaveConfig({
      channelPointsEnabled,
      channelPointsRewardId: formData.channelPointsRewardId.trim(),
      twitchChannel: formData.twitchChannel.trim(),
      twitchBotUsername: formData.twitchBotUsername.trim(),
      twitchBotOauthToken: formData.twitchBotOauthToken.trim(),
      twitchClientId: formData.twitchClientId.trim(),
      twitchClientSecret: formData.twitchClientSecret.trim(),
      ytmdaCompanionUrl: formData.ytmdaCompanionUrl.trim(),
      spotifyClientId: formData.spotifyClientId.trim(),
      spotifyFallbackPlaylist: formData.spotifyFallbackPlaylist.trim(),
      streamPlaylistUrl: formData.streamPlaylistUrl.trim(),
      playbackProvider: formData.playbackProvider,
      spotifyFallbackToYtm: formData.spotifyFallbackToYtm,

      maxSongDurationSeconds: formData.maxSongDurationMinutes * 60,
      maxActivePerViewer: Number(formData.maxActivePerViewer),
      voteSkipThreshold: Number(formData.voteSkipThreshold),
      simulationMode: formData.simulationMode,
      language: formData.language as 'de' | 'en'
    });
    } catch (error) { setSaveError(error instanceof Error ? error.message : t('saveFailed')); return; }
    setSaveError('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const flushAutoSave = (includeTypedToken = false) => {
    if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    const patch = { ...pendingPatchRef.current };
    const hasFullToken = typeof patch.twitchBotOauthToken === 'string' && (
      patch.twitchBotOauthToken.trim().startsWith('oauth:') ? patch.twitchBotOauthToken.trim().length >= 25 : patch.twitchBotOauthToken.trim().length >= 20
    );
    if (includeTypedToken || hasFullToken) {
      pendingPatchRef.current = {};
    } else {
      delete patch.twitchBotOauthToken;
      pendingPatchRef.current = pendingPatchRef.current.twitchBotOauthToken
        ? { twitchBotOauthToken: pendingPatchRef.current.twitchBotOauthToken }
        : {};
    }
    if (!Object.keys(patch).length) return;
    saveChainRef.current = saveChainRef.current.catch(() => {}).then(() => onSaveConfig(patch));
    void saveChainRef.current.then(() => {
      setSaveError('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    }).catch(error => setSaveError(error instanceof Error ? error.message : t('saveFailed')));
  };

  useEffect(() => {
    const previous = previousFormRef.current;
    previousFormRef.current = formData;
    if (!formChangeRef.current) return;
    formChangeRef.current = false;
    const patch: Partial<BotConfig> = {};
    for (const key of Object.keys(formData) as Array<keyof typeof formData>) {
      if (JSON.stringify(formData[key]) === JSON.stringify(previous[key])) continue;
      if (key === 'maxSongDurationMinutes') patch.maxSongDurationSeconds = formData.maxSongDurationMinutes * 60;
      else (patch as Record<string, unknown>)[key] = typeof formData[key] === 'string' ? formData[key].trim() : formData[key];
    }
    if (!Object.keys(patch).length) return;
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(flushAutoSave, 700);
  }, [formData]);

  useEffect(() => {
    void primeConfigSession().catch(() => {});
    const saveOnExit = () => {
      if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      if (sendConfigOnExit(pendingPatchRef.current as Record<string, unknown>)) pendingPatchRef.current = {};
    };
    window.addEventListener('pagehide', saveOnExit);
    return () => {
      window.removeEventListener('pagehide', saveOnExit);
      flushAutoSave(true);
    };
  }, []);

  const isTwitchReady = Boolean((config.twitchTokenConfigured || twitchOAuth.state === 'connected') && formData.twitchChannel.trim());
  const isPlayerReady = formData.playbackProvider === 'spotify'
    ? Boolean(spotifyStatus?.connected && spotifyStatus?.premium)
    : Boolean(config.companionConnected || embeddedYtmPlayer);
  const isPointsReady = Boolean(channelPointsEnabled && formData.channelPointsRewardId);
  const scrollTo = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <div id="setup-guide-container" className="space-y-6" onChangeCapture={() => { formChangeRef.current = true; }} onBlurCapture={event => flushAutoSave(event.target.id === 'twitch-oauth')}>

      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
        <label className="block text-sm text-neutral-200" htmlFor="stream-playlist-url">{t('streamPlaylistUrlLabel')}</label>
        <input id="stream-playlist-url" value={formData.streamPlaylistUrl} onChange={e => setFormData(prev => ({...prev, streamPlaylistUrl: e.target.value}))} placeholder="https://open.spotify.com/playlist/…" className="mt-2 w-full bg-neutral-950 border border-neutral-700 rounded-xl p-3 text-sm text-white" />
        <p className="text-xs text-neutral-400 mt-2">{t('streamPlaylistHint')}</p>
      </section>
      {/* Schnellstart- & Bereitschafts-Checkliste für Anfänger */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-purple-950/40 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-neutral-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {formData.language === 'de' ? 'Setup-Assistent: In 3 Schritten startklar' : 'Setup Assistant: Ready in 3 Steps'}
              </h2>
              <p className="text-xs text-neutral-400">
                {formData.language === 'de'
                  ? 'Hier richtest du deinen Bot ein. Folge einfach den Schritten von oben nach unten.'
                  : 'Configure your bot here. Simply follow the numbered steps from top to bottom.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Sprache direkt oben */}
            <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-700/80 rounded-xl px-3 py-1.5 shadow-sm">
              <Globe className="w-4 h-4 text-purple-400" />
              <label htmlFor="ui-language" className="text-xs font-semibold text-neutral-300">
                {formData.language === 'de' ? 'Sprache' : 'Language'}:
              </label>
              <select
                id="ui-language"
                value={formData.language}
                onChange={(e) => {
                  const newLang = e.target.value as 'de' | 'en';
                  setFormData(prev => ({ ...prev, language: newLang }));
                  void onSaveConfig({ language: newLang }).catch(error => setSaveError(error.message));
                }}
                className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer"
              >
                <option value="de" className="bg-neutral-900 text-white">Deutsch</option>
                <option value="en" className="bg-neutral-900 text-white">English</option>
              </select>
            </div>

            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isTwitchReady && isPlayerReady
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              {isTwitchReady && isPlayerReady ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {formData.language === 'de' ? 'Bereit für den Stream! ✓' : 'Ready for Streaming! ✓'}
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  {formData.language === 'de' ? 'Einrichtung unvollständig' : 'Setup incomplete'}
                </>
              )}
            </span>
          </div>
        </div>

        {/* 3 Status-Kacheln mit Schnellzugriff */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Status 1: Twitch */}
          <button
            type="button"
            onClick={() => scrollTo('step-twitch')}
            className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:border-purple-500/40 transition-all text-left group cursor-pointer"
          >
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                {formData.language === 'de' ? 'Schritt 1: Twitch-Chat' : 'Step 1: Twitch Chat'}
              </span>
              <strong className="text-xs text-white block">
                {formData.twitchChannel ? `@${formData.twitchChannel.replace(/^#/, '')}` : (formData.language === 'de' ? 'Kanalname fehlt' : 'Channel missing')}
              </strong>
              <span className="text-[11px] text-neutral-400 block">
                {isTwitchReady
                  ? (formData.language === 'de' ? 'Verbunden ✓' : 'Connected ✓')
                  : (formData.language === 'de' ? 'Klicken zum Einrichten' : 'Click to setup')}
              </span>
            </div>
            <span className={`w-3 h-3 rounded-full shrink-0 ${isTwitchReady ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
          </button>

          {/* Status 2: Player */}
          <button
            type="button"
            onClick={() => scrollTo('step-player')}
            className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:border-purple-500/40 transition-all text-left group cursor-pointer"
          >
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                {formData.language === 'de' ? 'Schritt 2: Musik-Player' : 'Step 2: Music Player'}
              </span>
              <strong className="text-xs text-white block">
                {formData.playbackProvider === 'spotify' ? 'Spotify Connect' : 'YouTube Music'}
              </strong>
              <span className="text-[11px] text-neutral-400 block">
                {isPlayerReady
                  ? (formData.language === 'de' ? 'Wiedergabe bereit ✓' : 'Playback ready ✓')
                  : (formData.language === 'de' ? 'Konto verbinden' : 'Connect account')}
              </span>
            </div>
            <span className={`w-3 h-3 rounded-full shrink-0 ${isPlayerReady ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
          </button>

          {/* Status 3: Kanalpunkte */}
          <button
            type="button"
            onClick={() => scrollTo('step-rewards')}
            className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:border-purple-500/40 transition-all text-left group cursor-pointer"
          >
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                {formData.language === 'de' ? 'Schritt 3: Kanalpunkte' : 'Step 3: Channel Points'}
              </span>
              <strong className="text-xs text-white block">
                {formData.language === 'de' ? 'Songrequest-Reward' : 'Song Request Reward'}
              </strong>
              <span className="text-[11px] text-neutral-400 block">
                {isPointsReady
                  ? (formData.language === 'de' ? 'Belohnung verknüpft ✓' : 'Reward linked ✓')
                  : (formData.language === 'de' ? 'Optional (Klick zum Setup)' : 'Optional (Click to setup)')}
              </span>
            </div>
            <span className={`w-3 h-3 rounded-full shrink-0 ${isPointsReady ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
          </button>
        </div>
      </div>

      {/* SCHRITT 1: Twitch-Kanal & Bot-Account */}
      <section id="step-twitch" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {formData.language === 'de' ? 'Schritt 1' : 'Step 1'}
                </span>
                <h2 className="text-base font-bold text-white">
                  {formData.language === 'de' ? 'Twitch-Kanal & Bot-Verbindung' : 'Twitch Channel & Bot Connection'}
                </h2>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {formData.language === 'de'
                  ? 'Verbinde den Bot mit deinem Stream, damit Zuschauer Song-Requests (!sr) im Chat abgeben können.'
                  : 'Connect the bot to your stream so viewers can submit song requests (!sr) in chat.'}
              </p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium self-start sm:self-auto ${
            isTwitchReady
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}>
            {isTwitchReady
              ? (formData.language === 'de' ? 'Verbunden ✓' : 'Connected ✓')
              : (formData.language === 'de' ? 'Nicht verbunden' : 'Not connected')}
          </span>
        </div>

        {/* 1. Kanalname */}
        <div className="space-y-1.5">
          <label htmlFor="twitch-channel" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            {formData.language === 'de' ? 'Dein Twitch-Kanalname (Streamer-Konto)' : 'Your Twitch Channel Name (Streamer Account)'}
          </label>
          <input
            id="twitch-channel"
            type="text"
            value={formData.twitchChannel}
            onChange={(e) => setFormData({ ...formData, twitchChannel: e.target.value })}
            placeholder="e.g. chocdeee"
            className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
          />
          <p className="text-[11px] text-neutral-400">
            {formData.language === 'de'
              ? 'Der Kanal, in dem du streamst (ohne @ oder #). Hier lauscht der Bot auf Chatbefehle.'
              : 'The channel where you stream live (without @ or #). The bot will listen for commands here.'}
          </p>
        </div>

        {/* Offline- & Simulationsmodus (Sinnvoll umverteilt bei Twitch) */}
        <div className={`p-4 rounded-xl border transition-all ${
          formData.simulationMode
            ? 'bg-amber-950/25 border-amber-500/40'
            : 'bg-neutral-950/50 border-neutral-800'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-neutral-200 block">
                {formData.language === 'de' ? 'Simulationsmodus (Offline-Test)' : 'Simulation Mode (Offline Test)'}
              </span>
              <p className="text-[11px] text-neutral-400">
                {formData.simulationMode
                  ? (formData.language === 'de'
                      ? '⚠ Aktiv: Der Bot verbindet sich nicht mit Twitch. Songwünsche können im Reiter „Chat & Command Tester“ offline simuliert werden. Für deinen echten Live-Stream ausschalten!'
                      : '⚠ Active: The bot does not connect to Twitch. Requests can be simulated in "Chat & Command Tester". Turn off for real live streaming!')
                  : (formData.language === 'de'
                      ? 'Ausgeschaltet (Standard): Der Bot empfängt echte Songwünsche live aus deinem Twitch-Chat.'
                      : 'Disabled (Standard): The bot receives real requests live from your Twitch chat.')}
              </p>
            </div>
            <label className="switch-row shrink-0">
              <input
                type="checkbox"
                checked={formData.simulationMode}
                onChange={e => {
                  const val = e.target.checked;
                  setFormData(prev => ({ ...prev, simulationMode: val }));
                  void onSaveConfig({ simulationMode: val });
                }}
              />
              <span className="switch" />
            </label>
          </div>
        </div>

        {/* 2. Anmelde-Methode Tabs */}
        <div className="pt-2 border-t border-neutral-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              {formData.language === 'de' ? 'Bot-Konto Autorisierung' : 'Bot Account Authorization'}
            </span>
            <div className="inline-flex rounded-lg bg-neutral-950 p-1 border border-neutral-800 text-xs">
              <button
                type="button"
                onClick={() => setTwitchAuthMode('device')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  twitchAuthMode === 'device' ? 'bg-purple-600 text-white shadow' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {formData.language === 'de' ? '1-Klick-Anmeldung (Empfohlen)' : '1-Click Login (Recommended)'}
              </button>
              <button
                type="button"
                onClick={() => setTwitchAuthMode('manual')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  twitchAuthMode === 'manual' ? 'bg-purple-600 text-white shadow' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {formData.language === 'de' ? 'Manueller Token' : 'Manual Token'}
              </button>
            </div>
          </div>

          {twitchAuthMode === 'device' ? (
            <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {simpleTwitchLogin
                    ? (formData.language === 'de'
                      ? 'Klicke auf „Mit Twitch verbinden“, bestätige den angezeigten Code auf Twitch – fertig. Es ist keine Einrichtung bei Twitch nötig.'
                      : 'Click "Connect with Twitch" and confirm the code shown on Twitch – done. No setup on Twitch is needed.')
                    : (formData.language === 'de'
                      ? 'Der Bot generiert einen 8-stelligen Code, den du einfach auf Twitch bestätigst. Dafür trägst du einmalig deine Twitch Client-ID ein.'
                      : 'The bot generates an 8-character code you approve on Twitch. You just need your Twitch Client ID once.')}
                </p>
                {!simpleTwitchLogin && <button
                  type="button"
                  onClick={() => setShowTwitchGuide(!showTwitchGuide)}
                  className="text-xs text-purple-300 hover:text-purple-200 inline-flex items-center gap-1 font-semibold shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{formData.language === 'de' ? '1-Minuten-Anleitung' : '1-minute guide'}</span>
                  {showTwitchGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>}
              </div>

              {/* Aufklappbare Twitch-Anleitung für Anfänger */}
              {!simpleTwitchLogin && showTwitchGuide && (
                <div className="rounded-lg bg-neutral-950 border border-purple-500/30 p-3.5 text-xs text-neutral-300 space-y-2">
                  <strong className="text-purple-300 font-semibold block">
                    {formData.language === 'de' ? 'So erstellst du deine kostenlose Twitch Client-ID in 60 Sekunden:' : 'How to create your free Twitch Client ID in 60 seconds:'}
                  </strong>
                  <ol className="list-decimal pl-4 space-y-1.5 text-neutral-300">
                    <li>
                      {formData.language === 'de' ? 'Öffne die' : 'Open the'}{' '}
                      <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer" className="text-purple-300 underline font-semibold inline-flex items-center gap-1">
                        Twitch Developer Console <ExternalLink className="w-3 h-3" />
                      </a>{' '}
                      {formData.language === 'de' ? 'und melde dich an.' : 'and sign in.'}
                    </li>
                    <li>
                      {formData.language === 'de' ? 'Klicke oben rechts auf „Anwendung registrieren“ (Register Your Application).' : 'Click "Register Your Application" on the top right.'}
                    </li>
                    <li>
                      {formData.language === 'de' ? 'Name: Gib einen Namen ein (z. B. „Mein Stream Musikbot“). Kategorie: Wähle „Chatbot“.' : 'Name: Enter any name (e.g. "My Stream Music Bot"). Category: Select "Chatbot".'}
                    </li>
                    <li>
                      {formData.language === 'de' ? 'OAuth Redirect-URLs: Trage genau' : 'OAuth Redirect-URLs: Enter exactly'}{' '}
                      <code className="text-purple-300 font-mono bg-purple-950/60 px-1 py-0.5 rounded">https://localhost</code>{' '}
                      {formData.language === 'de' ? 'ein und klicke auf „Hinzufügen“.' : 'and click "Add".'}
                    </li>
                    <li>
                      {formData.language === 'de' ? 'Client-Typ: Wähle „Öffentlich“ (Public). Falls du „Vertraulich“ wählst, trage unten auch das Client-Secret ein!' : 'Client Type: Select "Public". If you select "Confidential", also enter the Client Secret below!'}
                    </li>
                    <li>
                      {formData.language === 'de' ? 'Klicke auf „Verwalten“ und kopiere deine Client-ID in das Feld unten – fertig!' : 'Click "Manage" and copy your Client ID into the field below – done!'}
                    </li>
                  </ol>
                </div>
              )}

              {!simpleTwitchLogin && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="twitch-client-id" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Twitch Client-ID <span className="text-purple-400">*</span>
                  </label>
                  <input
                    id="twitch-client-id"
                    type="text"
                    value={formData.twitchClientId}
                    onChange={e => setFormData({ ...formData, twitchClientId: e.target.value })}
                    placeholder="z. B. gp762nuuoqcoxypju8c569th9wz7q5"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="twitch-client-secret" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Twitch Client-Secret <span className="text-neutral-400 font-normal">({formData.language === 'de' ? 'erforderlich bei vertraulichen Apps' : 'required for confidential apps'})</span>
                  </label>
                  <input
                    id="twitch-client-secret"
                    type="password"
                    value={formData.twitchClientSecret}
                    onChange={e => setFormData({ ...formData, twitchClientSecret: e.target.value })}
                    placeholder={config.twitchClientSecretConfigured ? (formData.language === 'de' ? '●●●●●●●● (gespeichert)' : '●●●●●●●● (stored)') : (formData.language === 'de' ? 'Client-Secret eingeben (optional)' : 'Enter Client Secret (optional)')}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>}

              {config.twitchBuiltInAppAvailable && config.twitchUsesBuiltInApp && (
                <p className="text-xs text-amber-100/90 leading-relaxed rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  {formData.language === 'de'
                    ? 'Die mitgelieferte Twitch-Anwendung teilt sich ein Anfrage-Limit mit allen, die diese Version nutzen. Auf der Freigabeseite erscheint der Name dieser Anwendung. Wenn die Anmeldung fehlschlägt, Anfragen stocken oder die Verbindung abbricht, öffne „Erweitert“ und trage deine eigene Client-ID ein.'
                    : 'The included Twitch app shares one request limit with everyone using this version. Twitch’s approval page shows that app’s name. If login fails, requests stall, or the connection drops, open “Advanced” and enter your own Client ID.'}
                </p>
              )}

              {config.twitchBuiltInAppAvailable && config.twitchUsesBuiltInApp && (
                <button type="button" onClick={() => setShowOwnTwitchApp(!showOwnTwitchApp)}
                  className="text-xs text-neutral-400 hover:text-neutral-200 inline-flex items-center gap-1">
                  <span>{formData.language === 'de' ? 'Erweitert: eigene Twitch-Anwendung verwenden' : 'Advanced: use my own Twitch app'}</span>
                  {showOwnTwitchApp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}

              <div className="pt-1 flex items-center gap-3 flex-wrap">
                {config.twitchTokenConfigured && !simpleTwitchLogin && (
                  <button type="button" onClick={() => void resumeTwitchOAuth()} disabled={twitchOAuth.state === 'pending'}
                    className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-bold">
                    {formData.language === 'de' ? 'Secret speichern & Verbindung wiederherstellen' : 'Save secret & restore connection'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void startTwitchOAuth()}
                  disabled={twitchOAuth.state === 'pending'}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-colors inline-flex items-center gap-2 shadow-lg shadow-purple-900/30"
                >
                  {twitchOAuth.state === 'pending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  <span>
                    {twitchOAuth.state === 'pending'
                      ? (formData.language === 'de' ? 'Warte auf Bestätigung…' : 'Waiting for confirmation…')
                      : (config.twitchTokenConfigured && !config.twitchAuthError)
                        ? (formData.language === 'de' ? 'Konto wechseln / Neu autorisieren' : 'Switch account / Re-authorize')
                        : (formData.language === 'de' ? 'Mit Twitch verbinden' : 'Connect with Twitch')}
                  </span>
                </button>
              </div>

              {/* Status: Code-Eingabe aktiv */}
              {twitchOAuth.state === 'pending' && (
                <div className="p-4 rounded-xl border border-purple-500/40 bg-purple-950/40 space-y-3">
                  <div className="flex items-center gap-2 text-purple-300 text-xs font-semibold">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    <span>{formData.language === 'de' ? 'Bestätige den Code auf der Twitch-Seite:' : 'Confirm this code on the Twitch page:'}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xl sm:text-2xl font-black tracking-widest text-white bg-neutral-950 px-4 py-2 rounded-xl border border-purple-500/50 shadow-inner">
                      {twitchOAuth.userCode}
                    </span>
                    <button
                      type="button"
                      onClick={copyUserCode}
                      className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedUserCode ? (formData.language === 'de' ? 'Kopiert! ✓' : 'Copied! ✓') : (formData.language === 'de' ? 'Code kopieren' : 'Copy code')}</span>
                    </button>
                    {twitchOAuth.verificationUri && (
                      <a
                        href={twitchOAuth.verificationUri}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow"
                      >
                        <span>{formData.language === 'de' ? 'Twitch-Aktivierungsseite öffnen' : 'Open Twitch Activation'}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    {formData.language === 'de'
                      ? 'Gib den Code im Browser ein und klicke auf "Autorisieren". Der Bot verbindet sich danach vollautomatisch!'
                      : 'Enter the code in your browser and click "Authorize". The bot connects automatically afterwards!'}
                  </p>
                </div>
              )}

              {/* Status: Erfolgreich verbunden oder gespeichert */}
              {(twitchOAuth.state === 'connected' || (config.twitchTokenConfigured && twitchOAuth.state === 'idle' && !config.twitchAuthError)) && (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center justify-between gap-2 font-medium">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{formData.language === 'de' ? 'Gespeichert & verbunden als' : 'Saved & connected as'} @<strong>{twitchOAuth.login || config.twitchBotUsername || 'Bot'}</strong></span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-semibold">
                    {formData.language === 'de' ? 'Aktiv ✓' : 'Active ✓'}
                  </span>
                </div>
              )}

              {/* Status: Fehler */}
              {(twitchOAuth.state === 'error' || Boolean(config.twitchAuthError)) && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{twitchOAuth.error || config.twitchAuthError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-3">
              <p className="text-xs text-neutral-400">
                {formData.language === 'de'
                  ? 'Falls du bereits einen OAuth-Token für deinen Bot besitzt (z. B. über TwitchTokenGenerator), kannst du ihn hier direkt eingeben.'
                  : 'If you already have an OAuth token for your bot, you can paste it here directly.'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="twitch-bot-name" className="block text-xs font-semibold text-neutral-300 mb-1">
                    {t('twitchBotUsername')}
                  </label>
                  <input
                    id="twitch-bot-name"
                    type="text"
                    value={formData.twitchBotUsername}
                    onChange={(e) => setFormData({ ...formData, twitchBotUsername: e.target.value })}
                    placeholder="e.g. MyStreamBot"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100"
                  />
                </div>
                <div>
                  <label htmlFor="twitch-oauth" className="block text-xs font-semibold text-neutral-300 mb-1">
                    {t('twitchBotOauth')}
                  </label>
                  <input
                    id="twitch-oauth"
                    autoComplete="off"
                    type="password"
                    value={formData.twitchBotOauthToken}
                    onChange={(e) => setFormData({ ...formData, twitchBotOauthToken: e.target.value })}
                    placeholder={config.twitchTokenConfigured ? (formData.language === 'de' ? '●●●●●●●● (gespeichert)' : '●●●●●●●● (stored)') : 'oauth:xxxxxxxxxxxxxxxxxxxx'}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-neutral-100"
                  />
                </div>
              </div>
              <p className="text-[11px] text-neutral-500">
                {t('twitchTokenStatus')} {config.twitchTokenConfigured ? t('tokenStoredHint') : t('tokenMissingHint')}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* SCHRITT 2: Musik-Wiedergabe & Player-Wahl */}
      <section id="step-player" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {formData.language === 'de' ? 'Schritt 2' : 'Step 2'}
                </span>
                <h2 className="text-base font-bold text-white">
                  {formData.language === 'de' ? 'Wiedergabe-Player & Musik-Plugin' : 'Playback Player & Music Selection'}
                </h2>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {formData.language === 'de'
                  ? 'Wähle aus, welcher Webplayer deine Songwünsche abspielen soll.'
                  : 'Choose which web player the bot controls for your song requests.'}
              </p>
            </div>
          </div>
          <span className="text-xs px-3 py-1 rounded-full border font-medium border-purple-500/30 bg-purple-500/10 text-purple-300 self-start sm:self-auto">
            {formData.playbackProvider === 'spotify' ? 'Spotify' : 'YouTube Music'} ({formData.language === 'de' ? 'Aktiv' : 'Active'})
          </span>
        </div>

        {/* 2 Player-Karten nebeneinander */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* YouTube Music Option */}
          <div 
            onClick={() => {
              setFormData(prev => ({ ...prev, playbackProvider: 'youtube_music' }));
              void onSaveConfig({ playbackProvider: 'youtube_music' });
            }}
            className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
              formData.playbackProvider === 'youtube_music'
                ? 'bg-purple-950/30 border-purple-500 shadow-md shadow-purple-950/40 ring-1 ring-purple-500/50'
                : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Music2 className="w-5 h-5 text-red-400" />
                  <span className="font-bold text-sm text-white">YouTube Music Web Player</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase font-semibold ${
                  formData.playbackProvider === 'youtube_music' ? 'bg-purple-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}>
                  {formData.playbackProvider === 'youtube_music' ? (formData.language === 'de' ? 'Aktiv' : 'Active') : (formData.language === 'de' ? 'Auswählen' : 'Select')}
                </span>
              </div>
              <span className="inline-block text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {formData.language === 'de' ? '✓ Empfohlen für Anfänger · Kostenlos' : '✓ Recommended for beginners · Free'}
              </span>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {formData.language === 'de'
                  ? 'Nativer YouTube Music Player direkt im Bot-Fenster. Unterstützt alle Song-Anfragen von YouTube & YouTube Music ohne Premium-Abo.'
                  : 'Native YouTube Music player inside the bot. Plays all songs from YouTube and YouTube Music without any Premium subscription.'}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-800/80">
              <button
                type="button"
                disabled={isStartingGoogleLogin}
                onClick={event => {
                  event.stopPropagation();
                  void startGoogleLogin();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-wait transition-colors text-xs font-semibold"
              >
                {isStartingGoogleLogin ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span>{isStartingGoogleLogin
                  ? (formData.language === 'de' ? 'Warte auf Google-Anmeldung…' : 'Waiting for Google sign-in…')
                  : googleAuthenticated
                    ? (formData.language === 'de' ? 'Google-Konto wechseln' : 'Switch Google account')
                    : (formData.language === 'de' ? 'Google-Konto anmelden (Optional)' : 'Sign in with Google (Optional)')}</span>
              </button>

              <div className="text-[11px] text-neutral-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${googleAuthenticated ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                  <span>{googleAuthenticated ? (formData.language === 'de' ? 'Google-Konto aktiv' : 'Google connected') : (formData.language === 'de' ? 'Google: Nicht angemeldet' : 'Google: Not signed in')}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${config.companionConnected ? 'bg-emerald-400' : 'bg-emerald-400'}`} />
                  <span>{formData.language === 'de' ? 'Web Player bereit ✓' : 'Web player ready ✓'}</span>
                </span>
              </div>

              {googleLoginMessage && (
                <div className="text-[11px] leading-relaxed rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-emerald-300" role="status">
                  {googleLoginMessage}
                </div>
              )}
              {googleLoginError && (
                <div className="text-[11px] leading-relaxed rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-red-300" role="alert">
                  {googleLoginError}
                </div>
              )}
            </div>
          </div>

          {/* Spotify Option */}
          <div 
            onClick={() => {
              setFormData(prev => ({ ...prev, playbackProvider: 'spotify' }));
              void onSaveConfig({ playbackProvider: 'spotify' });
            }}
            className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
              formData.playbackProvider === 'spotify'
                ? 'bg-emerald-950/30 border-emerald-500 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/50'
                : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold text-base leading-none">●</span>
                  <span className="font-bold text-sm text-white">Spotify Web Player / Connect</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase font-semibold ${
                  formData.playbackProvider === 'spotify' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}>
                  {formData.playbackProvider === 'spotify' ? (formData.language === 'de' ? 'Aktiv' : 'Active') : (formData.language === 'de' ? 'Auswählen' : 'Select')}
                </span>
              </div>
              <span className="inline-block text-[11px] font-semibold text-neutral-400 bg-neutral-800/80 px-2 py-0.5 rounded border border-neutral-700">
                {formData.language === 'de' ? 'Erfordert Spotify Premium' : 'Requires Spotify Premium'}
              </span>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {formData.language === 'de'
                  ? 'Spielt Songwünsche direkt auf deiner Spotify Desktop-App oder deinen Spotify-Connect-Lautsprechern ab.'
                  : 'Plays requests directly on your Spotify desktop app or Spotify Connect speakers.'}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-800/80">
              <div className="text-[11px] text-neutral-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${spotifyStatus?.connected && spotifyStatus?.premium ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                  <span>{spotifyStatus?.connected && spotifyStatus?.premium
                    ? (formData.language === 'de' ? 'Premium verbunden ✓' : 'Premium connected ✓')
                    : (formData.language === 'de' ? 'Setup erforderlich' : 'Setup required')}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ausführliches Spotify Setup nur wenn Spotify ausgewählt ist */}
        {formData.playbackProvider === 'spotify' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Spotify Developer & Connect Einrichtung</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSpotifyGuide(!showSpotifyGuide)}
                className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 font-semibold"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{formData.language === 'de' ? 'Anleitung für Spotify Client-ID' : 'Guide for Spotify Client ID'}</span>
                {showSpotifyGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Aufklappbare Spotify-Anleitung für Anfänger */}
            {showSpotifyGuide && (
              <div className="rounded-lg bg-neutral-950 border border-emerald-500/30 p-3.5 text-xs text-neutral-300 space-y-2">
                <strong className="text-emerald-300 font-semibold block">
                  {formData.language === 'de' ? 'So erstellst du deine Spotify Developer App:' : 'How to create your Spotify Developer App:'}
                </strong>
                <ol className="list-decimal pl-4 space-y-1.5 text-neutral-300">
                  <li>
                    {formData.language === 'de' ? 'Öffne das' : 'Open the'}{' '}
                    <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold inline-flex items-center gap-1">
                      Spotify Developer Dashboard <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    {formData.language === 'de' ? 'und melde dich an.' : 'and sign in.'}
                  </li>
                  <li>
                    {formData.language === 'de' ? 'Klicke auf „Create app“.' : 'Click "Create app".'}
                  </li>
                  <li>
                    {formData.language === 'de' ? 'App Name: z. B. „Twitch Music Bot“. Redirect URI: Trage genau ein:' : 'App Name: e.g. "Twitch Music Bot". Redirect URI: Enter exactly:'}{' '}
                    <code className="text-emerald-300 font-mono bg-emerald-950/80 px-1 py-0.5 rounded">http://127.0.0.1:3000/auth/spotify/callback</code>
                  </li>
                  <li>
                    {formData.language === 'de' ? 'Welche APIs? Wähle „Web API“ aus. Akzeptiere die Nutzungsbedingungen und klicke auf „Save“.' : 'Which APIs? Select "Web API". Accept terms and click "Save".'}
                  </li>
                  <li>
                    {formData.language === 'de' ? 'Gehe in die App Settings, kopiere die Client-ID und füge sie unten ein.' : 'Go to Settings, copy your Client ID, and paste it below.'}
                  </li>
                </ol>
              </div>
            )}

            {isConnectingSpotify && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-blue-400" />
                <span>{formData.language === 'de' ? 'Spotify-Verbindung läuft. Bitte bestätige das Browser-Fenster…' : 'Connecting to Spotify. Please approve in browser…'}</span>
              </div>
            )}

            {spotifySuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{spotifySuccess}</span>
              </div>
            )}

            {spotifyError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{spotifyError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                Spotify Client ID
              </label>
              <input
                value={formData.spotifyClientId}
                onChange={e => setFormData({ ...formData, spotifyClientId: e.target.value })}
                placeholder="Spotify Developer Client ID"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Redirect URI: <code className="text-neutral-400">http://127.0.0.1:3000/auth/spotify/callback</code>
              </p>
            </div>

            <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              {formData.language === 'de' ? 'Ausweich-Playlist nach dem letzten Song' : 'Fallback playlist after last song'}
              <input
                value={formData.spotifyFallbackPlaylist}
                onChange={e => setFormData(prev => ({ ...prev, spotifyFallbackPlaylist: e.target.value }))}
                placeholder="https://open.spotify.com/playlist/…"
                className="mt-1.5 w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm font-normal text-neutral-100"
              />
              <span className="block text-[11px] text-neutral-500 mt-1 font-normal">
                {formData.language === 'de' ? 'Spielt diese Spotify-Playlist automatisch ab, wenn keine Songwünsche in der Queue sind.' : 'Plays this playlist automatically when no requests are queued.'}
              </span>
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void connectSpotify()}
                disabled={isConnectingSpotify}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold flex items-center gap-2 text-xs transition-colors shadow"
              >
                {isConnectingSpotify && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {spotifyStatus?.connected
                  ? (formData.language === 'de' ? 'Spotify neu verbinden' : 'Reconnect Spotify')
                  : (formData.language === 'de' ? 'Spotify verbinden' : 'Connect Spotify')}
              </button>
              {spotifyStatus?.connected && (
                <button
                  type="button"
                  onClick={() => void disconnectSpotify()}
                  className="px-3.5 py-2 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs transition-colors"
                >
                  {formData.language === 'de' ? 'Trennen' : 'Disconnect'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadSpotifyStatus()}
                className="px-3.5 py-2 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{formData.language === 'de' ? 'Status prüfen' : 'Check status'}</span>
              </button>
            </div>
          </div>
        )}

        {/* YTM Companion Pairing nur wenn externe App */}
        {formData.playbackProvider === 'youtube_music' && !embeddedYtmPlayer && (
          <YtmPairingWizard
            language={formData.language as 'de' | 'en'}
            isConnected={config.companionConnected}
            companionUrl={config.ytmdaCompanionUrl}
            pairingState={pairingState}
            embedded={embeddedYtmPlayer}
          />
        )}
      </section>

      {/* SCHRITT 3: Twitch-Kanalpunkte (Songrequest-Reward) */}
      <section id="step-rewards" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {formData.language === 'de' ? 'Schritt 3 · Beliebt & Optional' : 'Step 3 · Popular & Optional'}
                </span>
                <h2 className="text-base font-bold text-white">
                  {formData.language === 'de' ? 'Twitch-Kanalpunkte (Songrequest-Reward)' : 'Twitch Channel Points (Song Requests)'}
                </h2>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {formData.language === 'de'
                  ? 'Erlaube Zuschauern, Songs direkt mit Twitch-Kanalpunkten zu wünschen.'
                  : 'Allow viewers to request songs directly using Twitch Channel Points.'}
              </p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium self-start sm:self-auto ${
            isPointsReady
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-neutral-700 text-neutral-400'
          }`}>
            {isPointsReady
              ? (formData.language === 'de' ? 'Belohnung aktiv ✓' : 'Reward active ✓')
              : (formData.language === 'de' ? 'Optional' : 'Optional')}
          </span>
        </div>

        <ChannelPointsSettings
          enabled={channelPointsEnabled}
          onEnabledChange={(enabled) => {
            setChannelPointsEnabled(enabled);
            void onSaveConfig({ channelPointsEnabled: enabled }).catch(error => setRewardsError(error instanceof Error ? error.message : t('saveFailed')));
          }}
          rewardId={formData.channelPointsRewardId}
          onRewardChange={(channelPointsRewardId) => void selectReward(channelPointsRewardId)}
          rewards={rewards}
          loading={rewardsLoading}
          error={rewardsError}
          canLoad={Boolean(formData.twitchChannel.trim() && (formData.twitchBotOauthToken.trim() || config.twitchTokenConfigured))}
          tokenConfigured={Boolean(config.twitchTokenConfigured)}
          hasTypedToken={Boolean(formData.twitchBotOauthToken.trim())}
          language={formData.language as 'de' | 'en'}
          onLoad={() => void loadRewards()}
          onCreate={() => void createReward()}
          t={t}
        />
      </section>

      <StreamDeckSetupCard language={formData.language as 'de' | 'en'} />

      {saveError && <p role="alert" className="text-xs text-red-400">{saveError}</p>}

      {/* Footer mit Speicherstatus & Hinweis auf Commands & Regeln */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-neutral-800/80">
        <p className="text-xs text-neutral-400">
          {formData.language === 'de'
            ? '💡 Regeln wie maximale Songdauer, Limits pro Zuschauer oder Skip-Stimmen findest du im Reiter „Commands & Regeln“.'
            : '💡 Rules like max song duration, viewer limits, or skip votes are in the "Commands & Rules" tab.'}
        </p>
        <button
          type="button"
          onClick={e => void handleSave(e)}
          className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-purple-900/30 flex items-center gap-2 shrink-0 cursor-pointer"
        >
          {saved ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
          <span>{saved ? (formData.language === 'de' ? 'Gespeichert! ✓' : 'Saved! ✓') : t('saveSettings')}</span>
        </button>
      </div>

    </div>
  );
};
