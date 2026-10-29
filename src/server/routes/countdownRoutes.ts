import { Router } from 'express';
import { countdownId, DONATION_PROVIDERS, type CountdownAction, type DonationProvider } from '../../countdown.ts';
import { getCountdownService } from '../countdownService.ts';
import { getCountdownDonations } from '../countdownDonations.ts';
import { BotError } from '../errors.ts';
import { botService } from '../botService.ts';

export function createCountdownRoutes() {
  const router = Router();
  const validation = <T>(fn: () => T): T => {
    try { return fn(); } catch (error) {
      throw new BotError('VALIDATION', error instanceof Error ? error.message : 'Ungültige Countdown-Eingabe.', 400);
    }
  };
  router.get('/countdowns', (_req, res) => res.json(getCountdownService().snapshot()));
  router.get('/countdowns/overlay/:id', (req, res) => {
    if (!botService.overlayTokenMatches(typeof req.query.token === 'string' ? req.query.token : '')) throw new BotError('AUTH_REQUIRED', 'Ungültiger Overlay-Schlüssel.', 403);
    const id = validation(() => countdownId(req.params.id)), state = getCountdownService().snapshot();
    res.json({ profile: state.profiles[id], run: state.runs[id], serverNow: state.serverNow });
  });
  router.get('/countdowns/connections', (_req, res) => res.json(getCountdownDonations().snapshot()));
  router.post('/countdowns/connections/:provider', (req, res) => {
    if (!DONATION_PROVIDERS.includes(req.params.provider as DonationProvider)) throw new BotError('VALIDATION', 'Unbekannter Anbieter.', 400);
    res.json(validation(() => getCountdownDonations().update(req.params.provider as DonationProvider, req.body)));
  });
  router.post('/countdowns/:id/config', (req, res) => res.json(validation(() => getCountdownService().update(countdownId(req.params.id), req.body))));
  router.post('/countdowns/:id/control', (req, res) => res.json(validation(() => getCountdownService().command(countdownId(req.params.id), req.body?.action as CountdownAction, req.body?.seconds))));
  return router;
}
