import { Router } from 'express';
import { asyncRoute } from '../http.ts';
import { installStreamDeckPlugin, streamDeckStatus } from '../streamDeckService.ts';

export function createStreamDeckRoutes() {
  const router = Router();
  router.get('/streamdeck/status', (_req, res) => res.json({ success: true, ...streamDeckStatus() }));
  // POST (and therefore session-protected): hands the bundled plugin to the Stream Deck app's installer.
  router.post('/streamdeck/install', asyncRoute(async (_req, res) => {
    await installStreamDeckPlugin();
    res.json({ success: true });
  }));
  return router;
}
