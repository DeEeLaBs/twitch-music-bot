import React, { useState } from 'react';
import { ListMusic, Trash2, Plus, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import type { BadgeType, Track } from '../types.ts';
import { useTranslations } from '../translations.ts';

interface QueueListProps {
  language?: 'de' | 'en';
  queue: Track[];
  onAddSong: (query: string, username: string, badge: BadgeType) => Promise<{ success?: boolean; error?: string }>;
  onVeto: (trackId: string) => void;
  onClearQueue: () => void;
  onMove: (trackId: string, newIndex: number) => void;
}

const QueueListComponent: React.FC<QueueListProps> = ({
  language = 'de',
  queue,
  onAddSong,
  onVeto,
  onClearQueue,
  onMove
}) => {
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const t = useTranslations(language);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await onAddSong(query.trim(), 'Streamer', 'broadcaster');
      if (res && !res.success) {
        setErrorMsg(res.error || 'Failed to add song');
      } else {
        setQuery('');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getBadgePrefix = (b: BadgeType) => {
    switch (b) {
      case 'broadcaster':
        return '👑';
      case 'moderator':
        return '🛡️';
      case 'vip':
        return '💎';
      case 'subscriber':
        return '⭐';
      default:
        return '👤';
    }
  };

  return (
    <div
      id="queue-list-container"
      className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-purple-400" />
          <h2 className="text-base font-bold text-white">
            {language === 'de' ? 'Warteschlange' : 'Queue'} (
            <span id="queue-header-count">{queue.length}</span> {language === 'de' ? 'Songs' : 'songs'})
          </h2>
        </div>
        {queue.length > 0 && (
          <button
            id="btn-clear-queue"
            type="button"
            onClick={() => {
              if (window.confirm(t('queueClearConfirm'))) onClearQueue();
            }}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('qlClearBtn')}</span>
          </button>
        )}
      </div>

      {/* Manual Add Bar */}
      <form
        onSubmit={handleSubmit}
        className="py-3 border-b border-neutral-800 flex gap-2"
      >
        <input
          id="input-song-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            language === 'de'
              ? 'Songtitel, YouTube oder Spotify Link eingeben...'
              : 'Enter song title, YouTube or Spotify link...'
          }
          className="flex-1 bg-neutral-950 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <button
          id="btn-submit-song-request"
          type="submit"
          disabled={isSubmitting || !query.trim()}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-md shadow-purple-900/30"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>{isSubmitting ? (language === 'de' ? 'Suche…' : 'Resolving…') : (language === 'de' ? 'Hinzufügen' : 'Add')}</span>
        </button>
      </form>

      {errorMsg && (
        <div id="queue-form-error" role="alert" className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* Queue Items */}
      <div id="queue-items-container" className="space-y-2.5 mt-3 max-h-[420px] overflow-y-auto pr-1">
        {queue.length === 0 ? (
          <div className="py-8 text-center text-neutral-500 italic">
            {language === 'de' ? 'Die Warteschlange ist leer.' : 'The queue is empty.'}
          </div>
        ) : (
          queue.map((track, index) => (
            <div
              key={track.id}
              draggable
              onDragStart={() => setDragId(track.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== track.id) onMove(dragId, index);
              }}
              className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/60 hover:bg-neutral-800/80 border border-neutral-800/80 transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-5 text-center text-xs font-mono font-bold text-neutral-500">
                  #{index + 1}
                </span>
                <img
                  src={track.albumArtUrl || (track.videoId ? `https://img.youtube.com/vi/${track.videoId}/hqdefault.jpg` : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=120&q=80')}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover bg-neutral-900 border border-neutral-700/60 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=120&q=80';
                  }}
                />
                <div className="min-w-0">
                  <div
                    className="text-xs font-semibold text-neutral-200 truncate group-hover:text-white"
                    title={track.title}
                  >
                    {track.title}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate flex items-center gap-1.5">
                    <span className="truncate">{track.artist}</span>
                    {track.requestSource === 'spotify' && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1 text-[8px] font-bold uppercase text-emerald-300">
                        Spotify
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-500">
                    <span className="text-neutral-300 font-medium">
                      {getBadgePrefix(track.requester.badge)} @{track.requester.displayName}
                    </span>
                    <span>•</span>
                    <span>{formatDuration(track.duration)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMove(track.id, index - 1)}
                  className="p-1 text-neutral-500 hover:text-neutral-200 disabled:opacity-20 rounded transition-colors"
                  title={language === 'de' ? 'Nach oben' : 'Move up'}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === queue.length - 1}
                  onClick={() => onMove(track.id, index + 1)}
                  className="p-1 text-neutral-500 hover:text-neutral-200 disabled:opacity-20 rounded transition-colors"
                  title={language === 'de' ? 'Nach unten' : 'Move down'}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onVeto(track.id)}
                  className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title={language === 'de' ? 'Entfernen' : 'Remove'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const QueueList = React.memo(QueueListComponent);
