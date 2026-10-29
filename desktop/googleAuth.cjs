const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const LOGIN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F';
const ALLOWED_COOKIE_DOMAINS = ['google.com', 'youtube.com'];
const AUTH_COOKIE_NAMES = new Set(['SID', 'SAPISID', '__Secure-3PSID', 'LOGIN_INFO']);

function resolveLoginUrl(candidate) {
  if (!candidate) return LOGIN_URL;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'https:' && (host === 'accounts.google.com' || host === 'accounts.youtube.com')) {
      return parsed.toString();
    }
  } catch {}
  return LOGIN_URL;
}

function findBrowser(env = process.env, exists = fs.existsSync) {
  const candidates = [
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean);
  return candidates.find(candidate => exists(candidate)) || null;
}

function isAllowedCookieDomain(domain = '') {
  const normalized = String(domain).replace(/^\./, '').toLowerCase();
  return ALLOWED_COOKIE_DOMAINS.some(allowed => normalized === allowed || normalized.endsWith(`.${allowed}`));
}

function toElectronCookie(cookie) {
  if (!cookie || !cookie.name || !isAllowedCookieDomain(cookie.domain)) return null;
  const domain = String(cookie.domain || '').replace(/^\./, '');
  const sameSite = { Strict: 'strict', Lax: 'lax', None: 'no_restriction' }[cookie.sameSite] || 'unspecified';
  const result = {
    url: `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path || '/'}`,
    name: String(cookie.name),
    value: String(cookie.value || ''),
    domain: cookie.domain,
    path: cookie.path || '/',
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite
  };
  if (Number.isFinite(cookie.expires) && cookie.expires > 0) result.expirationDate = cookie.expires;
  return result;
}

function hasGoogleLogin(cookies) {
  return cookies.some(cookie => isAllowedCookieDomain(cookie.domain) && AUTH_COOKIE_NAMES.has(cookie.name) && cookie.value);
}

function isGoogleLoginComplete(cookies, pageUrl = '') {
  if (!hasGoogleLogin(cookies)) return false;
  try {
    const parsed = new URL(pageUrl);
    return parsed.protocol === 'https:' && parsed.hostname === 'music.youtube.com';
  } catch {
    return false;
  }
}

async function importGoogleCookies(targetSession, incoming, replaceSession = false) {
  if (!incoming.length) throw new Error('Die Google-Sitzung enthält keine übertragbaren Cookies.');
  if (!replaceSession) {
    const results = await Promise.allSettled(incoming.map(cookie => targetSession.cookies.set(cookie)));
    if (!results.some(result => result.status === 'fulfilled')) throw new Error('Die Google-Sitzung konnte nicht in den Player übernommen werden.');
    return;
  }
  const previous = (await targetSession.cookies.get({})).filter(cookie => isAllowedCookieDomain(cookie.domain));
  try {
    for (const cookie of previous) {
      const normalized = toElectronCookie(cookie);
      if (normalized) await targetSession.cookies.remove(normalized.url, cookie.name);
    }
    for (const cookie of incoming) await targetSession.cookies.set(cookie);
  } catch (error) {
    for (const cookie of incoming) {
      await targetSession.cookies.remove(cookie.url, cookie.name).catch(() => {});
    }
    for (const cookie of previous) {
      const normalized = toElectronCookie(cookie);
      if (normalized) await targetSession.cookies.set(normalized).catch(() => {});
    }
    throw error;
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`Browser-Diagnose antwortet mit HTTP ${response.status}.`);
  return response.json();
}

async function cdpCommand(webSocketDebuggerUrl, method) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('Browser-Diagnose Zeitüberschreitung.')); }, 4000);
    socket.once('open', () => socket.send(JSON.stringify({ id: 1, method })));
    socket.on('message', raw => {
      try {
        const message = JSON.parse(String(raw));
        if (message.id !== 1) return;
        clearTimeout(timer);
        socket.close();
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
      } catch (error) {
        clearTimeout(timer);
        socket.terminate();
        reject(error);
      }
    });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function startGoogleAuth({ profileDir, targetSession, onAuthenticated, browserPath, authUrl, replaceSession = false, timeoutMs = 300_000 }) {
  const executable = browserPath || findBrowser();
  if (!executable) throw new Error('Für die sichere Google-Anmeldung wurde weder Google Chrome noch Microsoft Edge gefunden.');
  fs.mkdirSync(profileDir, { recursive: true });
  const port = await freePort();
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--app=${resolveLoginUrl(authUrl)}`
  ], { stdio: 'ignore', windowsHide: false });

  const started = Date.now();
  let misses = 0;
  while (Date.now() - started < timeoutMs) {
    await delay(750);
    try {
      const pages = await json(`http://127.0.0.1:${port}/json/list`);
      misses = 0;
      const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (!page) continue;
      const { cookies = [] } = await cdpCommand(page.webSocketDebuggerUrl, 'Network.getAllCookies');
      if (!isGoogleLoginComplete(cookies, page.url)) continue;
      const transferable = cookies.map(toElectronCookie).filter(Boolean);
      try {
        await importGoogleCookies(targetSession, transferable, replaceSession);
      } catch (error) {
        throw new Error(`Die Google-Sitzung konnte nicht in den Player übernommen werden: ${error.message}`);
      }
      await onAuthenticated?.();
      try {
        const version = await json(`http://127.0.0.1:${port}/json/version`);
        if (version.webSocketDebuggerUrl) await cdpCommand(version.webSocketDebuggerUrl, 'Browser.close');
      } catch {}
      return { browser: path.basename(executable), cookies: transferable.length };
    } catch (error) {
      if (error.message?.startsWith('Die Google-Sitzung konnte nicht in den Player übernommen werden:')) throw error;
      misses++;
      if (misses > 12 && child.exitCode !== null) throw new Error('Das Anmeldefenster wurde vor Abschluss geschlossen.');
    }
  }
  throw new Error('Zeitüberschreitung bei der Google-Anmeldung.');
}

module.exports = { LOGIN_URL, findBrowser, hasGoogleLogin, importGoogleCookies, isAllowedCookieDomain, isGoogleLoginComplete, resolveLoginUrl, startGoogleAuth, toElectronCookie };
