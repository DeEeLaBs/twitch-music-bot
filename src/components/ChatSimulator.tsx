import React, { useState } from 'react';
import { Send, MessageSquare, Zap } from 'lucide-react';
import type { BadgeType, BotLog } from '../types.ts';
import { useTranslations } from '../translations.ts';

interface ChatSimulatorProps {
  language?: string;
  logs: BotLog[];
  onSendMessage: (user: string, message: string, badge: BadgeType) => void;
}

const ChatSimulatorComponent: React.FC<ChatSimulatorProps> = ({
  logs,
  language,
  onSendMessage
}) => {
  const t = useTranslations((language as 'de' | 'en') || 'de');
  const [inputMsg, setInputMsg] = useState('!sr Bohemian Rhapsody');
  const [username, setUsername] = useState('AwesomeViewer');
  const [badge, setBadge] = useState<BadgeType>('viewer');
  const [category, setCategory] = useState<string>('ALL');
  const visibleLogs = category === 'ALL' ? logs : logs.filter(log => (log.category || 'BOT') === category);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;
    onSendMessage(username.trim() || 'Viewer', inputMsg.trim(), badge);
    setInputMsg('');
  };

  const sendPreset = (cmd: string, role: BadgeType = 'viewer', user: string = 'Viewer') => {
    onSendMessage(user, cmd, role);
  };

  const getBadgePill = (b?: BadgeType) => {
    switch (b) {
      case 'broadcaster':
        return <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] px-1.5 py-0.5 rounded font-bold">STREAMER</span>;
      case 'moderator':
        return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-1.5 py-0.5 rounded font-bold">MOD</span>;
      case 'vip':
        return <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] px-1.5 py-0.5 rounded font-bold">VIP</span>;
      case 'subscriber':
        return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] px-1.5 py-0.5 rounded font-bold">SUB</span>;
      default:
        return null;
    }
  };

  return (
    <div id="chat-simulator-container" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-purple-400" />
          <h2 className="text-base font-bold text-neutral-100">
            {t('csTitle') || "Twitch Chat & Command Tester"}
          </h2>
        </div>
        <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full font-medium">
          {t('csBadge') || "Interactive Live Simulator"}
        </span>
      </div>

      {/* Quick Test Command Chips */}
      <div className="py-3 border-b border-neutral-800 flex items-center gap-1.5 flex-wrap text-xs">
        <span className="text-neutral-400 font-semibold text-[11px] flex items-center gap-1 mr-1">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          {t('csTest') || "Test"}:
        </span>
        <button
          onClick={() => sendPreset('!sr Get Lucky Daft Punk', 'viewer', 'MusicFan')}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded-lg transition-colors border border-neutral-700"
        >
          !sr Daft Punk
        </button>
        <button
          onClick={() => sendPreset('!sr https://music.youtube.com/watch?v=34Na4j8AVgA', 'viewer', 'LinkSharer')}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded-lg transition-colors border border-neutral-700"
        >
          !sr YTM Link
        </button>
        <button
          onClick={() => sendPreset('!sr https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'viewer', 'SpotifyFan')}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded-lg transition-colors border border-neutral-700"
        >
          !sr Spotify Link
        </button>
        <button
          onClick={() => sendPreset('!np', 'viewer', 'Chatter')}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded-lg transition-colors border border-neutral-700"
        >
          !np
        </button>
        <button
          onClick={() => sendPreset('!queue', 'viewer', 'Chatter')}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded-lg transition-colors border border-neutral-700"
        >
          !queue
        </button>
        <button
          onClick={() => sendPreset('!voteskip', 'viewer', `Voter_${Math.floor(Math.random() * 80 + 10)}`)}
          className="bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 px-2.5 py-1 rounded-lg transition-colors border border-pink-500/30"
        >
          !voteskip
        </button>
        <button
          onClick={() => sendPreset('!skip', 'moderator', 'ModGuy')}
          className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2.5 py-1 rounded-lg transition-colors border border-emerald-500/30"
        >
          !skip (Mod)
        </button>
      </div>

      <div className="pt-3 flex items-center gap-2 text-xs"><label className="text-neutral-400">{language === 'en' ? 'Log category' : 'Log-Kategorie'}</label><select value={category} onChange={e=>setCategory(e.target.value)} className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5"><option value="ALL">Alle</option>{['TWITCH','YTM','QUEUE','SEARCH','CONFIG','BOT'].map(v=><option key={v} value={v}>{v}</option>)}</select></div>

      {/* Terminal / Chat Logs */}
      <div className="flex-1 overflow-y-auto bg-neutral-950 rounded-xl p-3 my-3 space-y-2 font-mono text-xs max-h-[320px] border border-neutral-800/80" role="log" aria-live="polite" aria-label={t('chatLog')}>
        {visibleLogs.length === 0 ? (
          <div className="text-neutral-500 italic py-8 text-center">
            {t('csEmpty') || "No chat or bot logs yet. Try typing a command below or clicking a preset button!"}
          </div>
        ) : (
          visibleLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            if (log.type === 'bot') {
              return (
                <div key={log.id} className="p-2 rounded bg-purple-950/40 border border-purple-500/30 text-purple-200">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] text-purple-400 tabular-nums">[{timeStr}]</span>
                    <span className="font-bold text-purple-300 flex items-center gap-1">
                      🤖 @Bot
                    </span>
                  </div>
                  <div className="text-white text-xs pl-2 font-sans font-medium">{log.message}</div>
                </div>
              );
            }

            if (log.type === 'chat') {
              return (
                <div key={log.id} className="flex items-start gap-2 py-0.5 text-neutral-300">
                  <span className="text-[10px] text-neutral-500 tabular-nums shrink-0">[{timeStr}]</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {getBadgePill(log.badge)}
                    <span className="font-semibold text-neutral-200">@{log.user}:</span>
                  </div>
                  <span className="text-neutral-100 font-sans break-words">{log.message}</span>
                </div>
              );
            }

            if (log.type === 'song') {
              return (
                <div key={log.id} className="py-1 px-2 rounded bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 text-[11px]">
                  <span className="text-[10px] text-emerald-500 tabular-nums mr-2">[{timeStr}]</span>
                  🎵 {log.message}
                </div>
              );
            }

            if (log.type === 'mod') {
              return (
                <div key={log.id} className="py-1 px-2 rounded bg-amber-950/30 border border-amber-500/20 text-amber-300 text-[11px]">
                  <span className="text-[10px] text-amber-500 tabular-nums mr-2">[{timeStr}]</span>
                  🛡️ {log.message}
                </div>
              );
            }

            if (log.type === 'error' || log.type === 'warn') {
              return (
                <div key={log.id} className="py-1 px-2 rounded bg-red-950/30 border border-red-500/20 text-red-300 text-[11px]">
                  <span className="text-[10px] text-red-500 tabular-nums mr-2">[{timeStr}]</span>
                  ⚠️ {log.message}
                </div>
              );
            }

            return (
              <div key={log.id} className="text-neutral-500 text-[11px] py-0.5">
                <span className="text-[10px] tabular-nums mr-2">[{timeStr}]</span>
                ℹ️ {log.message}
              </div>
            );
          })
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 shrink-0">
          <input
            id="input-sim-user"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('qlUsername') || "Username"}
            aria-label={t('qlUsername')}
            className="w-28 bg-neutral-950 border border-neutral-700 rounded-xl px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-purple-500"
          />
          <select
            id="select-sim-badge"
            value={badge}
            aria-label={t('requesterRole')}
            onChange={(e) => setBadge(e.target.value as BadgeType)}
            className="bg-neutral-950 border border-neutral-700 rounded-xl px-2 py-2 text-xs text-neutral-300 focus:outline-none focus:border-purple-500"
          >
            <option value="viewer">{t('qlRoleViewer') || "Viewer"}</option>
            <option value="subscriber">{t('qlRoleSub') || "Subscriber"}</option>
            <option value="vip">{t('qlRoleVip') || "VIP"}</option>
            <option value="moderator">{t('qlRoleMod') || "Moderator"}</option>
            <option value="broadcaster">{t('qlRoleStreamer') || "Streamer"}</option>
          </select>
        </div>

        <div className="flex-1 flex gap-2">
          <input
            id="input-sim-message"
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder={t('csInputPlaceholder') || "e.g. !sr Queen Bohemian Rhapsody, !np, !voteskip"}
            aria-label={t('chatMessage')}
            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
          />
          <button
            id="btn-sim-send"
            type="submit"
            className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-md shadow-purple-900/30"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t('csSend') || "Send"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export const ChatSimulator = React.memo(ChatSimulatorComponent);
