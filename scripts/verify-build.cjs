const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = path.join(root, 'dist', 'server.cjs');
if (!fs.existsSync(server)) throw new Error('dist/server.cjs fehlt.');
const text = fs.readFileSync(server, 'utf8');
const forbidden = '[Security.Cryptography.ProtectedData]::Protect';
if (text.includes(forbidden)) {
  throw new Error('Veralteter v1.4.0-Secret-Code im Produktions-Build gefunden. Build wurde verworfen.');
}
console.log('Build-Prüfung OK: kein veralteter ProtectedData::Protect-Code enthalten.');
