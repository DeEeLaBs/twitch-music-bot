import { apiFetch } from '../apiClient.ts';
import { useState } from 'react';
import type { YtmPairingState } from '../types.ts';
import { localizeBackendMessage, useTranslations } from '../translations.ts';
interface Props { language?: 'de' | 'en'; isConnected: boolean; companionUrl: string; pairingState?: YtmPairingState; embedded?: boolean | null; }
export function YtmPairingWizard({ language = 'de', isConnected, companionUrl, pairingState, embedded = false }: Props) {
  const t = useTranslations(language);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function action(path: string) {
    setBusy(true); setMessage('');
    try { const response = await apiFetch(path, { method: 'POST' }); const result = await response.json(); setMessage(result.details || result.message || (result.success ? t('done') : result.error || t('requestFailed'))); }
    catch { setMessage(t('apiUnavailable')); } finally { setBusy(false); }
  }
  const pairing = pairingState?.status === 'requesting_code' || pairingState?.status === 'waiting_for_user';
  const external = embedded === false;
  return <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4">
    <h2 className="font-bold text-lg">{t(external ? 'pairTitle' : 'embeddedYtmTitle')}</h2>
    <p className="text-sm text-neutral-300">{companionUrl} · {isConnected ? t(external ? 'pairAuthorized' : 'embeddedYtmConnected') : t('ytmNotConnected')}</p>
    {!external && <p className="text-sm text-neutral-400">{t('embeddedYtmDescription')}</p>}
    {external && <ol className="list-decimal pl-5 text-sm space-y-2 text-neutral-300"><li>{t('pairInstruction1')}</li><li>{t('pairInstruction2')}</li><li>{t('pairInstruction3')}</li></ol>}
    <div className="flex gap-3 flex-wrap">
      {external && <button className="bg-purple-600 rounded-lg px-4 py-2 disabled:opacity-40" disabled={busy || pairing} onClick={() => action('/api/ytm/pair/start')}>{t('pairAgain')}</button>}
      <button className="bg-neutral-700 rounded-lg px-4 py-2 disabled:opacity-40" disabled={busy || pairing} onClick={() => action('/api/ytm/test')}>{t('ytmRunDiag')}</button>
      {external && pairing && <button className="bg-neutral-700 rounded-lg px-4 py-2" onClick={() => action('/api/ytm/pair/cancel')}>{t('pairCancel')}</button>}
      {external && <button className="border border-neutral-600 rounded-lg px-4 py-2" disabled={busy || pairing} onClick={() => action('/api/ytm/pair/reset')}>{t('pairReset')}</button>}
    </div>
    {external && pairingState?.code && <p className="text-2xl font-mono">{pairingState.code}</p>}
    {external && <p role="status" className="text-sm text-amber-200">{localizeBackendMessage(pairingState?.error || pairingState?.message, language)}</p>}
    {message && <p role="status" className="text-sm text-neutral-200">{localizeBackendMessage(message, language)}</p>}
  </section>;
}
