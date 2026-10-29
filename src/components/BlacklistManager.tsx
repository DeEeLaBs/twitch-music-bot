import React, { useState } from 'react';
import { Ban, Trash2, Plus, CheckCircle } from 'lucide-react';
import type { BlacklistRule } from '../types.ts';
import { useTranslations } from '../translations.ts';

interface BlacklistManagerProps {
  language?: 'de' | 'en';
  blacklist: BlacklistRule[];
  onAddRule: (term: string, type: 'keyword' | 'artist' | 'channel') => void;
  onRemoveRule: (id: string) => void;
}

const BlacklistManagerComponent: React.FC<BlacklistManagerProps> = ({
  language = 'de',
  blacklist,
  onAddRule,
  onRemoveRule
}) => {
  const [term, setTerm] = useState('');
  const [type, setType] = useState<'keyword' | 'artist' | 'channel'>('keyword');
  const [feedback, setFeedback] = useState<string | null>(null);
  const t = useTranslations(language);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    onAddRule(term.trim(), type);
    setFeedback(`${t('blAdded')} "${term.trim()}" ${t('blToBlacklist')}`);
    setTerm('');
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div id="blacklist-manager-container" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-5">
        <div className="flex items-center gap-2.5">
          <Ban className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-bold text-neutral-100">
            {t('blTitle')} ({blacklist.length})
          </h2>
        </div>
        <span className="text-xs bg-red-500/10 text-red-300 border border-red-500/20 px-2.5 py-1 rounded-full font-medium">
          {t('blBadge')}
        </span>
      </div>

      <p className="text-xs text-neutral-400 mb-4">
        {t('blDesc')}
      </p>

      {/* Add New Filter Form */}
      <form onSubmit={handleSubmit} className="mb-5 flex flex-col sm:flex-row gap-2.5">
        <input
          aria-label={t('blPlaceholder')}
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('blPlaceholder')}
          className="flex-1 bg-neutral-950 border border-neutral-700/80 rounded-xl px-3.5 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
        />
        <select
          aria-label={t('blacklistRuleType')}
          value={type}
          onChange={(e) => setType(e.target.value as 'keyword' | 'artist' | 'channel')}
          className="bg-neutral-950 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:border-purple-500"
        >
          <option value="keyword">{t('blTypeKeyword')}</option>
          <option value="artist">{t('blTypeArtist')}</option>
          <option value="channel">{t('blTypeChannel')}</option>
        </select>
        <button
          type="submit"
          disabled={!term.trim()}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-md shadow-red-900/30"
        >
          <Plus className="w-4 h-4" />
          <span>{t('blAddBtn')}</span>
        </button>
      </form>

      {feedback && (
        <div role="status" aria-live="polite" className="mb-4 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5" />
          {feedback}
        </div>
      )}

      {/* Rules Badges & List */}
      <div className="bg-neutral-950 rounded-xl p-4 border border-neutral-800/80">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
          {t('blActiveRules')}
        </div>

        {blacklist.length === 0 ? (
          <div className="text-center py-6 text-neutral-500 text-xs">
            {t('blEmpty')}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blacklist.map((rule) => (
              <div
                key={rule.id}
                className="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-700/60 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 group hover:border-red-500/40 transition-colors"
              >
                <span className="font-mono text-neutral-100">{rule.term}</span>
                <span className="text-[10px] text-neutral-500 uppercase bg-neutral-800 px-1 rounded">
                  {rule.type}
                </span>
                <button
                  onClick={() => onRemoveRule(rule.id)}
                  className="text-neutral-500 hover:text-red-400 p-0.5 rounded transition-colors"
                  title={t('blRemoveTitle')}
                  aria-label={`${t('blRemoveTitle')}: ${rule.term}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const BlacklistManager = React.memo(BlacklistManagerComponent);
