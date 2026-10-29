import React, { useState, useMemo } from 'react';
import {
  SlidersHorizontal,
  ShieldCheck,
  Clock,
  Users,
  Search,
  Check,
  AlertCircle,
  Loader2,
  MessageSquare,
  Volume2,
  SkipForward,
  Trash2,
  Pause,
  Play,
  HelpCircle,
  ListMusic,
  ShieldAlert,
  UserX,
  Plus,
  Ban
} from 'lucide-react';
import type { BadgeType, BlacklistRule, BotConfig } from '../types.ts';
import { COMMANDS as RAW_COMMANDS, type CommandName } from '../server/commandRegistry.ts';

export interface CommandRulesStudioProps {
  config: BotConfig;
  language: 'de' | 'en';
  blacklist?: BlacklistRule[];
  onAddBlacklistRule?: (term: string, type: 'keyword' | 'artist' | 'channel') => Promise<void> | void;
  onRemoveBlacklistRule?: (id: string) => Promise<void> | void;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
  onNavigateToChat?: () => void;
}

const PERMISSION_PRESETS: Record<string, { labelDe: string; labelEn: string; roles: BadgeType[]; color: string }> = {
  all: {
    labelDe: 'Alle',
    labelEn: 'Everyone',
    roles: ['viewer', 'subscriber', 'vip', 'moderator', 'broadcaster'],
    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  },
  subscriber: {
    labelDe: 'Sub+',
    labelEn: 'Sub+',
    roles: ['subscriber', 'vip', 'moderator', 'broadcaster'],
    color: 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  },
  vip: {
    labelDe: 'VIP+',
    labelEn: 'VIP+',
    roles: ['vip', 'moderator', 'broadcaster'],
    color: 'bg-pink-500/15 text-pink-300 border-pink-500/30'
  },
  mod: {
    labelDe: 'Mod+',
    labelEn: 'Mod+',
    roles: ['moderator', 'broadcaster'],
    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  },
  broadcaster: {
    labelDe: 'Nur Streamer',
    labelEn: 'Streamer only',
    roles: ['broadcaster'],
    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  },
  disabled: {
    labelDe: 'Deaktiviert',
    labelEn: 'Disabled',
    roles: [],
    color: 'bg-red-500/15 text-red-300 border-red-500/30'
  }
};

const COMMAND_METADATA: Record<CommandName, {
  category: 'playback' | 'moderation' | 'general';
  descDe: string;
  descEn: string;
  icon: typeof MessageSquare;
}> = {
  streamplaylist: { category: 'moderation', descDe: 'Aktuellen Song speichern; !playlist link zeigt den Link.', descEn: 'Save current track; !playlist link shows the link.', icon: ListMusic },
  wrongsong: { category: 'playback', descDe: 'Eigenen letzten Songwunsch innerhalb von 60 Sekunden zurückziehen.', descEn: 'Withdraw your latest pending request within 60 seconds.', icon: ListMusic },
  sr: {
    category: 'playback',
    descDe: 'Songrequest: Titel per Suchtext, YouTube- oder Spotify-Link anfordern.',
    descEn: 'Song request: Request title by text search, YouTube, or Spotify link.',
    icon: Plus
  },
  song: {
    category: 'playback',
    descDe: 'Aktueller Song: Zeigt Titel, Interpret und Laufzeit im Chat an.',
    descEn: 'Now playing: Displays track title, artist, and progress in chat.',
    icon: ListMusic
  },
  queue: {
    category: 'playback',
    descDe: 'Warteschlange: Gibt die nächsten anstehenden Titel im Chat aus.',
    descEn: 'Queue: Displays the upcoming songs in chat.',
    icon: ListMusic
  },
  voteskip: {
    category: 'playback',
    descDe: 'Vote-Skip: Zuschauer stimmen demokratisch für das Überspringen ab.',
    descEn: 'Vote skip: Viewers democratically vote to skip the current song.',
    icon: Users
  },
  vol: {
    category: 'playback',
    descDe: 'Lautstärke: Regelt die Player-Lautstärke direkt über den Chat (0–100 %).',
    descEn: 'Volume: Adjusts player volume via chat (0–100%).',
    icon: Volume2
  },
  skip: {
    category: 'moderation',
    descDe: 'Mod-Skip: Überspringt den aktuellen Song sofort ohne Abstimmung.',
    descEn: 'Mod skip: Skips the current song immediately without a vote.',
    icon: SkipForward
  },
  veto: {
    category: 'moderation',
    descDe: 'Veto: Entfernt einen bestimmten Song aus der Warteschlange.',
    descEn: 'Veto: Removes a specific song from the queue.',
    icon: Trash2
  },
  clearqueue: {
    category: 'moderation',
    descDe: 'Queue leeren: Löscht alle Titel aus der Warteschlange.',
    descEn: 'Clear queue: Removes all songs from the request queue.',
    icon: AlertCircle
  },
  pause: {
    category: 'moderation',
    descDe: 'Pause: Hält die Wiedergabe an.',
    descEn: 'Pause: Pauses playback.',
    icon: Pause
  },
  resume: {
    category: 'moderation',
    descDe: 'Fortsetzen: Setzt die pausierte Wiedergabe fort.',
    descEn: 'Resume: Resumes paused playback.',
    icon: Play
  },
  blacklist: {
    category: 'moderation',
    descDe: 'Blacklist: Begriffe oder Interpreten für Requests sperren / entsperren.',
    descEn: 'Blacklist: Block or unblock terms and artists from being requested.',
    icon: ShieldAlert
  },
  help: {
    category: 'general',
    descDe: 'Hilfe: Listet verfügbare Befehle für Zuschauer im Chat auf.',
    descEn: 'Help: Lists available viewer commands in chat.',
    icon: HelpCircle
  }
};

function resolvePresetKey(roles: BadgeType[] | undefined, defaultRoles: BadgeType[]): string {
  if (roles !== undefined && Array.isArray(roles) && roles.length === 0) {
    return 'disabled';
  }
  const effective = roles || defaultRoles;
  for (const [key, preset] of Object.entries(PERMISSION_PRESETS)) {
    if (key === 'disabled') continue;
    if (preset.roles.length === effective.length && preset.roles.every(r => effective.includes(r))) {
      return key;
    }
  }
  return 'mod';
}

export const CommandRulesStudio: React.FC<CommandRulesStudioProps> = ({
  config,
  language,
  blacklist = [],
  onAddBlacklistRule,
  onRemoveBlacklistRule,
  onSaveConfig,
  onNavigateToChat
}) => {
  const isDe = language === 'de';

  // Form State
  const [commandPermissions, setCommandPermissions] = useState<Record<string, BadgeType[]>>(config.commandPermissions || {});
  const [commandCooldowns, setCommandCooldowns] = useState<Record<string, number>>(config.commandCooldowns || {});
  
  // Rules State
  const [maxDurationMin, setMaxDurationMin] = useState(Math.round((config.maxSongDurationSeconds || 420) / 60));
  const [minDurationSec, setMinDurationSec] = useState(config.minSongDurationSeconds ?? 20);
  const [maxActivePerViewer, setMaxActivePerViewer] = useState(config.maxActivePerViewer || 2);
  const [maxQueueSize, setMaxQueueSize] = useState(config.maxQueueSize || 100);
  const [preventRecentDuplicates, setPreventRecentDuplicates] = useState(config.preventRecentDuplicates ?? 10);
  const [requestCooldownSeconds, setRequestCooldownSeconds] = useState(config.requestCooldownSeconds ?? 10);
  const [globalRequestCooldownSeconds, setGlobalRequestCooldownSeconds] = useState(config.globalRequestCooldownSeconds ?? 2);
  const [voteSkipThreshold, setVoteSkipThreshold] = useState(config.voteSkipThreshold || 3);
  const [autoPlayRadio, setAutoPlayRadio] = useState(config.autoPlayRadio !== false);
  const [spotifyFallbackPlaylist, setSpotifyFallbackPlaylist] = useState(config.spotifyFallbackPlaylist || '');
  const [logLevel, setLogLevel] = useState<'debug' | 'info' | 'warn' | 'error'>(config.logLevel || 'info');
  const [blockedRequesters, setBlockedRequesters] = useState<string[]>(config.blockedRequesters || []);
  const [newBlockedUser, setNewBlockedUser] = useState('');

  // Blacklist State
  const [blacklistTerm, setBlacklistTerm] = useState('');
  const [blacklistType, setBlacklistType] = useState<'keyword' | 'artist' | 'channel'>('keyword');
  const [blacklistSearch, setBlacklistSearch] = useState('');
  const [blacklistTypeFilter, setBlacklistTypeFilter] = useState<'all' | 'keyword' | 'artist' | 'channel'>('all');
  const [blacklistFeedback, setBlacklistFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmittingBlacklist, setIsSubmittingBlacklist] = useState(false);

  // UI Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'playback' | 'moderation' | 'general'>('all');
  const [activeSection, setActiveSection] = useState<'all' | 'commands' | 'rules' | 'blacklist' | 'blocked'>('all');

  // Saving State
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleAddBlacklist = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = blacklistTerm.trim();
    if (!clean || !onAddBlacklistRule) return;

    setIsSubmittingBlacklist(true);
    try {
      await onAddBlacklistRule(clean, blacklistType);
      setBlacklistFeedback({
        type: 'success',
        message: isDe ? `"${clean}" zur Blacklist hinzugefügt.` : `Added "${clean}" to blacklist.`
      });
      setBlacklistTerm('');
      setTimeout(() => setBlacklistFeedback(null), 3000);
    } catch (err) {
      setBlacklistFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : (isDe ? 'Fehler beim Hinzufügen.' : 'Failed to add rule.')
      });
    } finally {
      setIsSubmittingBlacklist(false);
    }
  };

  const handleRemoveBlacklist = async (id: string, term: string) => {
    if (!onRemoveBlacklistRule) return;
    try {
      await onRemoveBlacklistRule(id);
      setBlacklistFeedback({
        type: 'success',
        message: isDe ? `"${term}" von Blacklist entfernt.` : `Removed "${term}" from blacklist.`
      });
      setTimeout(() => setBlacklistFeedback(null), 3000);
    } catch (err) {
      setBlacklistFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : (isDe ? 'Fehler beim Entfernen.' : 'Failed to remove rule.')
      });
    }
  };

  const filteredBlacklist = useMemo(() => {
    return (blacklist || []).filter(rule => {
      if (blacklistTypeFilter !== 'all' && rule.type !== blacklistTypeFilter) return false;
      if (blacklistSearch.trim()) {
        const q = blacklistSearch.trim().toLowerCase();
        return rule.term.toLowerCase().includes(q) || (rule.addedBy && rule.addedBy.toLowerCase().includes(q));
      }
      return true;
    });
  }, [blacklist, blacklistTypeFilter, blacklistSearch]);

  const keywordRulesCount = useMemo(() => (blacklist || []).filter(r => r.type === 'keyword').length, [blacklist]);
  const artistRulesCount = useMemo(() => (blacklist || []).filter(r => r.type === 'artist').length, [blacklist]);
  const channelRulesCount = useMemo(() => (blacklist || []).filter(r => r.type === 'channel').length, [blacklist]);

  const handleSave = async (overrides?: Partial<BotConfig>) => {
    setSaving(true);
    setSaveError('');
    setSavedSuccess(false);
    try {
      const payload: Partial<BotConfig> = {
        commandPermissions,
        commandCooldowns,
        maxSongDurationSeconds: Math.max(10, Math.min(7200, maxDurationMin * 60)),
        minSongDurationSeconds: Math.max(0, Math.min(600, minDurationSec)),
        maxActivePerViewer: Math.max(1, Math.min(20, maxActivePerViewer)),
        maxQueueSize: Math.max(1, Math.min(500, maxQueueSize)),
        preventRecentDuplicates: Math.max(0, Math.min(100, preventRecentDuplicates)),
        requestCooldownSeconds: Math.max(0, Math.min(300, requestCooldownSeconds)),
        globalRequestCooldownSeconds: Math.max(0, Math.min(60, globalRequestCooldownSeconds)),
        voteSkipThreshold: Math.max(1, Math.min(100, voteSkipThreshold)),
        autoPlayRadio,
        spotifyFallbackPlaylist: spotifyFallbackPlaylist.trim(),
        logLevel,
        blockedRequesters,
        ...overrides
      };
      await onSaveConfig(payload);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (isDe ? 'Speichern fehlgeschlagen.' : 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = (preset: 'standard' | 'strict' | 'relaxed') => {
    if (preset === 'standard') {
      setMaxDurationMin(7);
      setMinDurationSec(20);
      setMaxActivePerViewer(2);
      setMaxQueueSize(100);
      setPreventRecentDuplicates(10);
      setRequestCooldownSeconds(10);
      setGlobalRequestCooldownSeconds(2);
      setVoteSkipThreshold(3);
    } else if (preset === 'strict') {
      setMaxDurationMin(4);
      setMinDurationSec(30);
      setMaxActivePerViewer(1);
      setMaxQueueSize(40);
      setPreventRecentDuplicates(25);
      setRequestCooldownSeconds(30);
      setGlobalRequestCooldownSeconds(5);
      setVoteSkipThreshold(4);
    } else if (preset === 'relaxed') {
      setMaxDurationMin(10);
      setMinDurationSec(10);
      setMaxActivePerViewer(5);
      setMaxQueueSize(200);
      setPreventRecentDuplicates(5);
      setRequestCooldownSeconds(0);
      setGlobalRequestCooldownSeconds(0);
      setVoteSkipThreshold(2);
    }
  };

  const handleAddBlockedUser = () => {
    const clean = newBlockedUser.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return;
    if (!blockedRequesters.includes(clean)) {
      setBlockedRequesters([...blockedRequesters, clean]);
    }
    setNewBlockedUser('');
  };

  const handleRemoveBlockedUser = (name: string) => {
    setBlockedRequesters(blockedRequesters.filter(u => u !== name));
  };

  // Filtered Commands list
  const filteredCommands = useMemo(() => {
    return RAW_COMMANDS.filter(cmd => {
      const meta = COMMAND_METADATA[cmd.name];
      if (categoryFilter !== 'all' && meta.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = cmd.name.toLowerCase().includes(query) || `!${cmd.name}`.includes(query);
        const matchesAlias = cmd.aliases?.some(a => a.toLowerCase().includes(query) || `!${a}`.includes(query));
        const matchesDesc = (meta.descDe + meta.descEn).toLowerCase().includes(query);
        return matchesName || matchesAlias || matchesDesc;
      }
      return true;
    });
  }, [searchQuery, categoryFilter]);

  return (
    <div id="command-rules-studio" className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="relative overflow-hidden bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {isDe ? 'Commands & Bot-Regeln' : 'Commands & Bot Rules'}
              </h2>
            </div>
            <p className="text-xs text-neutral-400 max-w-2xl">
              {isDe
                ? 'Konfiguriere Chat-Befehle, Rollenberechtigungen, Cooldowns und Schutzregeln für Songrequests deines Twitch-Kanals.'
                : 'Configure chat commands, role permissions, cooldowns, and request protection rules for your Twitch channel.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {savedSuccess && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-fade-in">
                <Check className="w-4 h-4 text-emerald-400" />
                {isDe ? 'Gespeichert!' : 'Saved!'}
              </span>
            )}

            {saveError && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400" />
                {saveError}
              </span>
            )}

            <button
              id="btn-save-commands-rules"
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{isDe ? 'Änderungen speichern' : 'Save Changes'}</span>
            </button>
          </div>
        </div>

        {/* Quick Nav / Presets Toolbar */}
        <div className="mt-6 pt-4 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mr-1">
              {isDe ? 'Bereich:' : 'Section:'}
            </span>
            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeSection === 'all' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {isDe ? 'Alles anzeigen' : 'Show All'}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('commands')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeSection === 'commands' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {isDe ? 'Chat-Commands' : 'Commands'}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('rules')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeSection === 'rules' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {isDe ? 'Queue- & Song-Regeln' : 'Queue & Rules'}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('blacklist')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeSection === 'blacklist' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {isDe ? 'Inhaltsfilter & Blacklist' : 'Content Filters & Blacklist'} ({(blacklist || []).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('blocked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeSection === 'blocked' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {isDe ? 'Gesperrte Nutzer' : 'Blocked Viewers'} ({blockedRequesters.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-500 font-medium">{isDe ? 'Schnell-Presets:' : 'Quick Presets:'}</span>
            <button
              type="button"
              onClick={() => handleApplyPreset('standard')}
              className="px-2.5 py-1 rounded-md bg-neutral-800/80 hover:bg-neutral-700 text-[11px] text-neutral-300 transition-colors"
              title={isDe ? 'Empfohlene Standardwerte' : 'Recommended defaults'}
            >
              {isDe ? 'Standard' : 'Default'}
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('strict')}
              className="px-2.5 py-1 rounded-md bg-neutral-800/80 hover:bg-neutral-700 text-[11px] text-neutral-300 transition-colors"
              title={isDe ? 'Strenger Modus für große Stream-Events' : 'Strict mode for large events'}
            >
              {isDe ? 'Streng' : 'Strict'}
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('relaxed')}
              className="px-2.5 py-1 rounded-md bg-neutral-800/80 hover:bg-neutral-700 text-[11px] text-neutral-300 transition-colors"
              title={isDe ? 'Lockerer Modus für kleine Streams' : 'Relaxed mode for cozy streams'}
            >
              {isDe ? 'Locker' : 'Relaxed'}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: CHAT COMMANDS & PERMISSIONS */}
      {(activeSection === 'all' || activeSection === 'commands') && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-neutral-100">
                  {isDe ? 'Befehle, Rollenberechtigungen & Cooldowns' : 'Command Permissions & Cooldowns'}
                </h3>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                {isDe
                  ? 'Bestimme pro Befehl, welche Rolle (Zuschauer, Sub, VIP, Moderator oder Broadcaster) ihn verwenden darf und wie lang der Cooldown ist.'
                  : 'Specify which role can invoke each command and set custom cooldowns in seconds.'}
              </p>
            </div>

            {onNavigateToChat && (
              <button
                type="button"
                onClick={onNavigateToChat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-purple-300 text-xs font-semibold transition-colors shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{isDe ? 'Im Chat-Simulator testen →' : 'Test in Chat Simulator →'}</span>
              </button>
            )}
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isDe ? 'Befehl suchen (z. B. !sr, !skip, !vol)...' : 'Search command (e.g. !sr, !skip, !vol)...'}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(['all', 'playback', 'moderation', 'general'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    categoryFilter === cat
                      ? 'bg-purple-600 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {cat === 'all'
                    ? (isDe ? 'Alle Befehle' : 'All Commands')
                    : cat === 'playback'
                    ? (isDe ? 'Wiedergabe' : 'Playback')
                    : cat === 'moderation'
                    ? (isDe ? 'Moderatoren' : 'Moderation')
                    : (isDe ? 'Allgemein' : 'General')}
                </button>
              ))}
            </div>
          </div>

          {/* Commands Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCommands.map(cmd => {
              const meta = COMMAND_METADATA[cmd.name];
              const currentRoles = commandPermissions[cmd.name];
              const presetKey = resolvePresetKey(currentRoles, cmd.defaultPermissions);
              const currentPreset = PERMISSION_PRESETS[presetKey];
              const cooldown = commandCooldowns[cmd.name] ?? (cmd.name === 'sr' ? requestCooldownSeconds : (cmd.defaultCooldownSeconds ?? 0));
              const isDisabled = presetKey === 'disabled';

              return (
                <div
                  key={cmd.name}
                  className={`bg-neutral-950/80 border rounded-xl p-4 flex flex-col justify-between transition-all hover:border-neutral-700 ${
                    isDisabled ? 'border-red-900/30 opacity-70' : 'border-neutral-800'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-purple-300">
                          !{cmd.name}
                        </span>
                        {cmd.aliases && cmd.aliases.length > 0 && (
                          <span className="text-[10px] text-neutral-500 font-mono">
                            ({cmd.aliases.map(a => `!${a}`).join(', ')})
                          </span>
                        )}
                      </div>

                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${currentPreset.color}`}>
                        {isDe ? currentPreset.labelDe : currentPreset.labelEn}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-400 mb-4 min-h-[32px] line-clamp-2">
                      {isDe ? meta.descDe : meta.descEn}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-neutral-800/60">
                    <div>
                      <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                        {isDe ? 'Rolle / Berechtigung' : 'Permission Role'}
                      </label>
                      <select
                        aria-label={`Berechtigung für !${cmd.name}`}
                        value={presetKey}
                        onChange={e => {
                          const key = e.target.value;
                          setCommandPermissions(prev => ({
                            ...prev,
                            [cmd.name]: PERMISSION_PRESETS[key].roles
                          }));
                        }}
                        className="w-full bg-neutral-900 border border-neutral-700/80 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                      >
                        {Object.entries(PERMISSION_PRESETS).map(([key, preset]) => (
                          <option key={key} value={key}>
                            {isDe ? preset.labelDe : preset.labelEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                        <span>Cooldown</span>
                        <span className="text-neutral-300 font-mono">{cooldown}s</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Cooldown für !${cmd.name}`}
                          type="number"
                          min="0"
                          max="600"
                          value={cooldown}
                          onChange={e => {
                            const val = Math.max(0, Math.min(600, Number(e.target.value) || 0));
                            setCommandCooldowns(prev => ({ ...prev, [cmd.name]: val }));
                          }}
                          className="w-20 bg-neutral-900 border border-neutral-700/80 rounded-lg px-2.5 py-1 text-xs text-neutral-100 font-mono focus:outline-none focus:border-purple-500"
                        />
                        <div className="flex gap-1">
                          {[0, 5, 15, 30].map(quickSec => (
                            <button
                              key={quickSec}
                              type="button"
                              onClick={() => setCommandCooldowns(prev => ({ ...prev, [cmd.name]: quickSec }))}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                                cooldown === quickSec ? 'bg-purple-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                              }`}
                            >
                              {quickSec}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {cmd.name === 'blacklist' && (
                      <button
                        type="button"
                        onClick={() => setActiveSection('blacklist')}
                        className="w-full mt-2 py-1 px-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-[11px] text-red-300 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                        <span>{isDe ? `Blacklist-Regeln bearbeiten (${(blacklist || []).length}) →` : `Manage Blacklist Rules (${(blacklist || []).length}) →`}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: QUEUE & SONG REQUEST RULES */}
      {(activeSection === 'all' || activeSection === 'rules') && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="pb-4 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              <h3 className="text-base font-bold text-neutral-100">
                {isDe ? 'Warteschlangen- & Songrequest-Regeln' : 'Queue & Song Request Rules'}
              </h3>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              {isDe
                ? 'Lege Obergrenzen für Songlänge, Duplikate und Cooldowns fest, um deinen Stream vor Spam und Troll-Requests zu schützen.'
                : 'Define song length limits, spam prevention, and queue capacities to protect your stream from disruptions.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Rule 1: Max Song Duration */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Maximale Songdauer' : 'Maximum Song Duration'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {maxDurationMin} {isDe ? 'Minuten' : 'Minutes'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={maxDurationMin}
                onChange={e => setMaxDurationMin(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Songs, die länger als diese Dauer sind, werden vom Bot höflich abgelehnt.'
                  : 'Songs longer than this limit will be politely rejected by the bot.'}
              </p>
            </div>

            {/* Rule 2: Min Song Duration */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Mindest-Songdauer' : 'Minimum Song Duration'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {minDurationSec}s
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="120"
                step="5"
                value={minDurationSec}
                onChange={e => setMinDurationSec(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Verhindert Troll-Soundeffekte und Kurzvideos (0 = deaktiviert).'
                  : 'Prevents short troll sound clips or mic bursts (0 = disabled).'}
              </p>
            </div>

            {/* Rule 3: Max Active per Viewer */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Max. Songs pro Zuschauer' : 'Max Active Per Viewer'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {maxActivePerViewer} {isDe ? 'Titel' : 'Tracks'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={maxActivePerViewer}
                onChange={e => setMaxActivePerViewer(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Verhindert, dass ein einzelner Zuschauer die komplette Queue blockiert.'
                  : 'Prevents a single viewer from dominating the entire queue.'}
              </p>
            </div>

            {/* Rule 4: Max Queue Capacity */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Warteschlangen-Kapazität' : 'Queue Capacity Limit'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {maxQueueSize} {isDe ? 'Titel' : 'Tracks'}
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="10"
                value={maxQueueSize}
                onChange={e => setMaxQueueSize(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Maximale Anzahl wartender Songs. Danach werden neue Wünsche temporär pausiert.'
                  : 'Maximum number of queued songs before new requests are paused.'}
              </p>
            </div>

            {/* Rule 5: Duplicate Prevention */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Wiederholungssperre' : 'Duplicate Cooldown'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {preventRecentDuplicates} {isDe ? 'Titel' : 'Tracks'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={preventRecentDuplicates}
                onChange={e => setPreventRecentDuplicates(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Ein Song darf erst wieder gewünscht werden, wenn X andere Songs liefen.'
                  : 'A song cannot be requested again until X other songs have played.'}
              </p>
            </div>

            {/* Rule 6: Vote-Skip Threshold */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Vote-Skip Stimmen' : 'Votes Required to Skip'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {voteSkipThreshold} {isDe ? 'Stimmen' : 'Votes'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                value={voteSkipThreshold}
                onChange={e => setVoteSkipThreshold(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Wie viele Zuschauer per !voteskip abstimmen müssen, um den Titel zu überspringen.'
                  : 'Number of viewer votes needed for !voteskip to skip the current track.'}
              </p>
            </div>

            {/* Rule 7: User Request Cooldown */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Nutzer-Wartezeit (!sr)' : 'Per-User Request Cooldown'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {requestCooldownSeconds}s
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="180"
                step="5"
                value={requestCooldownSeconds}
                onChange={e => setRequestCooldownSeconds(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Pause zwischen zwei Songwünschen desselben Zuschauers (Mods ausgenommen).'
                  : 'Time a viewer must wait between requests (mods are exempt).'}
              </p>
            </div>

            {/* Rule 8: Global Request Cooldown */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Globaler Request-Cooldown' : 'Global Request Cooldown'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                  {globalRequestCooldownSeconds}s
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={globalRequestCooldownSeconds}
                onChange={e => setGlobalRequestCooldownSeconds(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Verhindert, dass in derselben Sekunde mehrere Requests gleichzeitig eintreffen.'
                  : 'Prevents multiple viewer requests hitting the queue simultaneously.'}
              </p>
            </div>

            {/* Rule 9: Autoplay & Radio Switch */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  {isDe ? 'Autoplay / Radio weiterspielen' : 'Autoplay Radio Continuation'}
                </span>
                <input
                  type="checkbox"
                  checked={autoPlayRadio}
                  onChange={e => setAutoPlayRadio(e.target.checked)}
                  className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Spielt automatisch passendes Webradio / Autoplay, wenn die Warteschlange leer ist.'
                  : 'Automatically plays radio suggestions when the viewer request queue is empty.'}
              </p>
            </div>

            {/* Rule 10: Log Level */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-200">
                    {isDe ? 'Log-Ausführlichkeit' : 'Log Level'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-300">
                    {logLevel}
                  </span>
                </div>
                <select
                  aria-label={isDe ? 'Log-Ausführlichkeit' : 'Log Level'}
                  value={logLevel}
                  onChange={e => setLogLevel(e.target.value as 'debug' | 'info' | 'warn' | 'error')}
                  className="w-full bg-neutral-900 border border-neutral-700/80 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="debug">debug ({isDe ? 'Sehr detailliert' : 'Verbose'})</option>
                  <option value="info">info ({isDe ? 'Standard' : 'Normal'})</option>
                  <option value="warn">warn ({isDe ? 'Nur Warnungen' : 'Warnings only'})</option>
                  <option value="error">error ({isDe ? 'Nur Fehler' : 'Errors only'})</option>
                </select>
              </div>
              <p className="text-[11px] text-neutral-500">
                {isDe
                  ? 'Steuert, wie viele Diagnose-Details der Bot im Terminal bzw. in der Konsole protokolliert.'
                  : 'Controls the amount of diagnostic output the bot writes to console/logs.'}
              </p>
            </div>
          </div>

          {/* Spotify Fallback Playlist Section */}
          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <label className="block text-xs font-semibold text-neutral-200 mb-1">
              {isDe ? 'Spotify Anschluss-Playlist (Fallback)' : 'Spotify Fallback Playlist'}
            </label>
            <p className="text-[11px] text-neutral-500 mb-2">
              {isDe
                ? 'Wenn Spotify der aktive Player ist, wird diese Playlist nahtlos gestartet, sobald alle Zuschauerwünsche abgespielt wurden.'
                : 'When Spotify is selected, this playlist starts automatically when all viewer requests have finished.'}
            </p>
            <input
              type="text"
              value={spotifyFallbackPlaylist}
              onChange={e => setSpotifyFallbackPlaylist(e.target.value)}
              placeholder="https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M…"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
        </div>
      )}

      {/* SECTION 3: CONTENT FILTERS & BLACKLIST */}
      {(activeSection === 'all' || activeSection === 'blacklist') && (
        <div id="section-blacklist" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div>
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-bold text-neutral-100">
                  {isDe ? 'Inhaltsfilter & Song-Blacklist' : 'Content Filters & Song Blacklist'}
                </h3>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                {isDe
                  ? 'Jeder Songwunsch im Twitch-Chat oder per Kanalpunkten, dessen Titel, Interpret oder Kanal mit diesen Regeln übereinstimmt, wird automatisch abgelehnt.'
                  : 'Any song requested via chat or channel points matching these terms, artists, or channels will be automatically rejected.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/20 font-mono">
                <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                {(blacklist || []).length} {isDe ? 'Regeln aktiv' : 'Active Rules'}
              </span>
            </div>
          </div>

          {/* Twitch Chat Commands Tip Banner */}
          <div className="bg-neutral-950/70 border border-purple-500/25 rounded-xl p-4 flex items-start gap-3 text-xs text-neutral-300">
            <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-300 shrink-0 mt-0.5">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="space-y-1 leading-relaxed">
              <div className="font-semibold text-purple-200">
                {isDe ? 'Live-Moderation im Twitch-Chat' : 'Live Twitch Chat Moderation'}
              </div>
              <p className="text-neutral-400">
                {isDe
                  ? 'Streamer und Moderatoren können die Blacklist jederzeit auch direkt im Chat bearbeiten:'
                  : 'Streamer and moderators can also manage blacklist rules on the fly directly in chat:'}
              </p>
              <div className="flex flex-wrap gap-2 pt-1 font-mono text-[11px]">
                <span className="bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700/60 text-purple-300">
                  !blacklist add &lt;Begriff&gt;
                </span>
                <span className="bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700/60 text-purple-300">
                  !blacklist remove &lt;Begriff&gt;
                </span>
              </div>
            </div>
          </div>

          {/* Add Rule Form */}
          <form onSubmit={handleAddBlacklist} className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-4 space-y-3">
            <label className="block text-xs font-semibold text-neutral-200">
              {isDe ? 'Neue Sperr-Regel hinzufügen' : 'Add New Blacklist Rule'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={blacklistTerm}
                onChange={e => setBlacklistTerm(e.target.value)}
                placeholder={
                  blacklistType === 'keyword'
                    ? (isDe ? 'Schlagwort / Troll-Begriff (z. B. Ear-Rape, Screamer)...' : 'Keyword or phrase to block...')
                    : blacklistType === 'artist'
                    ? (isDe ? 'Künstlername zum Sperren...' : 'Artist name to block...')
                    : (isDe ? 'Kanalname zum Sperren...' : 'Channel name to block...')
                }
                className="flex-1 bg-neutral-900 border border-neutral-700/80 rounded-xl px-3.5 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />

              <select
                aria-label={isDe ? 'Typ der Blacklist-Regel' : 'Rule Type'}
                value={blacklistType}
                onChange={e => setBlacklistType(e.target.value as 'keyword' | 'artist' | 'channel')}
                className="bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-red-500 cursor-pointer"
              >
                <option value="keyword">{isDe ? 'Wort / Begriff (Titel)' : 'Keyword (Title)'}</option>
                <option value="artist">{isDe ? 'Interpret / Künstler' : 'Banned Artist'}</option>
                <option value="channel">{isDe ? 'YouTube-Kanal' : 'Channel Name'}</option>
              </select>

              <button
                type="submit"
                disabled={!blacklistTerm.trim() || isSubmittingBlacklist}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 shadow-md shadow-red-900/30 cursor-pointer"
              >
                {isSubmittingBlacklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{isDe ? 'Zur Blacklist hinzufügen' : 'Add to Blacklist'}</span>
              </button>
            </div>
          </form>

          {/* Feedback Toast */}
          {blacklistFeedback && (
            <div
              role="status"
              className={`text-xs px-3.5 py-2 rounded-xl border flex items-center gap-2 ${
                blacklistFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-300'
              }`}
            >
              {blacklistFeedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{blacklistFeedback.message}</span>
            </div>
          )}

          {/* Search & Sub-Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={blacklistSearch}
                onChange={e => setBlacklistSearch(e.target.value)}
                placeholder={isDe ? 'Aktive Regeln durchsuchen...' : 'Search active rules...'}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <button
                type="button"
                onClick={() => setBlacklistTypeFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  blacklistTypeFilter === 'all'
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {isDe ? 'Alle' : 'All'} ({(blacklist || []).length})
              </button>
              <button
                type="button"
                onClick={() => setBlacklistTypeFilter('keyword')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  blacklistTypeFilter === 'keyword'
                    ? 'bg-red-500/20 text-red-300 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {isDe ? 'Begriffe' : 'Keywords'} ({keywordRulesCount})
              </button>
              <button
                type="button"
                onClick={() => setBlacklistTypeFilter('artist')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  blacklistTypeFilter === 'artist'
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {isDe ? 'Künstler' : 'Artists'} ({artistRulesCount})
              </button>
              <button
                type="button"
                onClick={() => setBlacklistTypeFilter('channel')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  blacklistTypeFilter === 'channel'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {isDe ? 'Kanäle' : 'Channels'} ({channelRulesCount})
              </button>
            </div>
          </div>

          {/* Active Rules List */}
          <div className="bg-neutral-950 rounded-xl p-4 border border-neutral-800/80">
            {filteredBlacklist.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-xs">
                {(blacklist || []).length === 0
                  ? (isDe
                      ? 'Keine aktiven Blacklist-Regeln vorhanden. Alle sauberen Songwünsche werden zugelassen.'
                      : 'No active blacklist rules. All clean song requests will be allowed.')
                  : (isDe
                      ? 'Keine Regeln gefunden, die zum Suchfilter passen.'
                      : 'No rules matching your filter.')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filteredBlacklist.map(rule => {
                  const typeLabel =
                    rule.type === 'keyword'
                      ? (isDe ? 'Begriff' : 'Keyword')
                      : rule.type === 'artist'
                      ? (isDe ? 'Künstler' : 'Artist')
                      : (isDe ? 'Kanal' : 'Channel');

                  const typeColor =
                    rule.type === 'keyword'
                      ? 'bg-red-500/10 text-red-300 border-red-500/25'
                      : rule.type === 'artist'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                      : 'bg-blue-500/10 text-blue-300 border-blue-500/25';

                  return (
                    <div
                      key={rule.id}
                      className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-2.5 flex items-center justify-between gap-2 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold uppercase tracking-wider ${typeColor}`}>
                            {typeLabel}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-neutral-100 font-semibold truncate" title={rule.term}>
                          {rule.term}
                        </p>
                        {rule.addedBy && (
                          <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                            {isDe ? 'von' : 'by'} @{rule.addedBy}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveBlacklist(rule.id, rule.term)}
                        className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer shrink-0"
                        title={isDe ? `"${rule.term}" von Blacklist entfernen` : `Remove "${rule.term}" from blacklist`}
                        aria-label={isDe ? `"${rule.term}" entfernen` : `Remove "${rule.term}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: BLOCKED REQUESTERS */}
      {(activeSection === 'all' || activeSection === 'blocked') && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
            <div>
              <div className="flex items-center gap-2">
                <UserX className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-bold text-neutral-100">
                  {isDe ? 'Für Songrequests gesperrte Zuschauer' : 'Viewers Blocked from Song Requests'}
                </h3>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                {isDe
                  ? 'Zuschauer auf dieser Liste können keine Songs anfordern. Moderatoren und Streamer können die Sperre nicht erhalten.'
                  : 'Viewers on this list are barred from requesting songs. Moderators and broadcaster are immune.'}
              </p>
            </div>

            <span className="text-xs text-neutral-400 font-mono">
              {blockedRequesters.length} {isDe ? 'gesperrt' : 'blocked'}
            </span>
          </div>

          <div className="flex items-center gap-2 max-w-md">
            <input
              type="text"
              value={newBlockedUser}
              onChange={e => setNewBlockedUser(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddBlockedUser(); }}
              placeholder={isDe ? 'Twitch-Benutzername zum Sperren...' : 'Twitch username to block...'}
              className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-red-500"
            />
            <button
              type="button"
              onClick={handleAddBlockedUser}
              className="px-3.5 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              {isDe ? 'Sperren' : 'Block'}
            </button>
          </div>

          {blockedRequesters.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {blockedRequesters.map(username => (
                <div
                  key={username}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200"
                >
                  <span className="font-mono">@{username}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBlockedUser(username)}
                    className="hover:text-white font-bold ml-1"
                    title={isDe ? 'Entsperren' : 'Unblock'}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500 italic py-2">
              {isDe ? 'Aktuell sind keine Zuschauer gesperrt.' : 'No viewers are currently blocked.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
