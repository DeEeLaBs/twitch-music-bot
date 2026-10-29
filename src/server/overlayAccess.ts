import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function tokensMatch(stored: string, given: string): boolean {
  if (!stored || !given) return false;
  const left = Buffer.from(stored);
  const right = Buffer.from(given);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function loadOrCreateOverlayToken(file = path.join(process.cwd(), 'data', 'overlay-token.json')): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { token?: unknown };
    if (typeof parsed.token === 'string' && parsed.token.length >= 32) return parsed.token;
  } catch {
    // Create a token the first time the overlay URL is requested.
  }
  const token = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ token }), { encoding: 'utf8' });
  return token;
}
