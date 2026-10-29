import { Router } from 'express';
import path from 'path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { parseFontDataUrl } from '../../alertFonts.ts';
import { BotError } from '../errors.ts';
import { asyncRoute } from '../http.ts';

export function createAlertFontRoutes(overlayAssetsDir: string) {
  const router = Router();
  router.post('/overlay/fonts', asyncRoute(async (req, res) => {
    const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : '';
    const parsed = parseFontDataUrl(dataUrl, fileName);
    if (parsed.ok === false) throw new BotError('VALIDATION', parsed.error, 400);
    const filename = `alert-font-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${parsed.font.extension}`;
    try {
      await fs.writeFile(path.join(overlayAssetsDir, filename), parsed.font.bytes, { flag: 'wx' });
    } catch {
      throw new BotError('INTERNAL', 'Schrift konnte nicht gespeichert werden.', 500);
    }
    res.json({
      success: true,
      id: `font_${crypto.randomBytes(4).toString('hex')}`,
      family: parsed.font.family,
      url: `/overlay-assets/${filename}`,
      format: parsed.font.format,
      mime: parsed.font.mime
    });
  }));
  return router;
}
