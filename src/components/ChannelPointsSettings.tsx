import React from 'react';
import { Coins, RefreshCw, PlusCircle } from 'lucide-react';
import type { TwitchChannelPointReward } from '../types.ts';

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  rewardId: string;
  onRewardChange: (rewardId: string) => void;
  rewards: TwitchChannelPointReward[];
  loading: boolean;
  error: string;
  canLoad: boolean;
  tokenConfigured: boolean;
  hasTypedToken: boolean;
  language: 'de' | 'en';
  onLoad: () => void;
  onCreate?: () => void;
  t: (key: string) => string;
}

export const ChannelPointsSettings: React.FC<Props> = ({
  enabled, onEnabledChange, rewardId, onRewardChange, rewards, loading, error,
  canLoad, tokenConfigured, hasTypedToken, language, onLoad, onCreate, t
}) => {
  const selected = rewards.find(reward => reward.id === rewardId);
  return <div className="md:col-span-2 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex gap-3">
          <Coins className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">{t('channelPointsTitle')}</h3>
            <p className="text-xs text-neutral-400 mt-1">{t('channelPointsDesc')}</p>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-200 shrink-0">
          <input type="checkbox" checked={enabled} onChange={e => onEnabledChange(e.target.checked)} className="h-4 w-4 accent-purple-500" />
          {t('channelPointsEnable')}
        </label>
      </div>
      {enabled && <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-end">
        <div>
          <label htmlFor="channel-points-reward" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">{t('channelPointsSelect')}</label>
          <select id="channel-points-reward" value={rewardId} onChange={e => onRewardChange(e.target.value)} disabled={loading}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded-xl px-3.5 py-2 text-sm text-neutral-100 focus:outline-none focus:border-purple-500">
            <option value="">{t('channelPointsChoose')}</option>
            {rewardId && !rewards.some(reward => reward.id === rewardId) && <option value={rewardId}>{t('channelPointsUnknown')}</option>}
            {rewards.map(reward => <option key={reward.id} value={reward.id}>{reward.title} · {reward.cost.toLocaleString()} {language === 'en' ? 'points' : 'Punkte'}{reward.isUserInputRequired ? '' : ' ⚠'}</option>)}
          </select>
        </div>
        <button type="button" onClick={onLoad} disabled={loading || !canLoad}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 px-3.5 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? t('channelPointsLoading') : t('channelPointsLoad')}
        </button>
        {onCreate && <button type="button" onClick={onCreate} disabled={loading || !canLoad} className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/40 px-3.5 py-2 text-sm font-semibold text-purple-200 hover:bg-purple-500/10 disabled:opacity-50"><PlusCircle className="w-4 h-4" />{language === 'de' ? 'Songrequest-Reward erstellen' : 'Create song request reward'}</button>}
      </div>}
      {enabled && !hasTypedToken && !tokenConfigured && <p className="text-xs text-amber-300">{t('channelPointsSaveFirst')}</p>}
      {enabled && !rewardId && (hasTypedToken || tokenConfigured) && <p className="text-xs text-neutral-400">{t('channelPointsChooseRequired')}</p>}
      {enabled && !loading && tokenConfigured && rewards.length === 0 && !error && <p className="text-xs text-neutral-500">{t('channelPointsNone')}</p>}
      {enabled && rewardId && selected?.isUserInputRequired === false && <p className="text-xs text-amber-300">{t('channelPointsInputHint')}</p>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  </div>;
};
