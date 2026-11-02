const { ipcRenderer } = require('electron');

// DOM-ready is too early for these client-rendered players. Keep the loading
// surface until the main content has text and occupies visible layout space.
window.addEventListener('DOMContentLoaded', () => {
  let done = false;
  const started = performance.now();
  const check = () => {
    if (done) return;
    const root = document.querySelector('main, #main, [role="main"], [data-testid="root"], ytmusic-browse-response, ytmusic-player-page, ytmusic-app');
    const rect = root?.getBoundingClientRect();
    const hasContent = root && rect.width > 0 && rect.height > 0 &&
      (root.textContent || '').trim().length > 40 &&
      root.querySelector('a[href], h1, h2, ytmusic-shelf-renderer, ytmusic-carousel-shelf-renderer');
    const login = document.querySelector('[data-testid="login-button"], form input[type="password"]');
    if (!hasContent && !login && performance.now() - started < 20000) return;
    done = true;
    clearInterval(timer);
    const channel = hasContent || login ? 'player-content-ready' : 'player-content-timeout';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ipcRenderer.sendToHost(channel);
      ipcRenderer.send(channel);
    }));
  };
  const timer = setInterval(check, 100);
  check();
  if (typeof document?.addEventListener === 'function') {
    document.addEventListener('click', (event) => {
      try {
        // Spotify's own click handler and the host's skip endpoint must not
        // both advance playback. Synthetic player-control clicks are already
        // commands and must never be reflected back to the host.
        if (window.location.hostname !== 'open.spotify.com' || !event.isTrusted) return;
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const button = target.closest('button, [role="button"]');
        if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
        const skipBtn = button.matches('[data-testid="control-button-skip-forward"]') ||
          (button.closest('[data-testid="now-playing-bar"], footer') &&
            ['next','next track','skip to next','weiter','nächster titel','nächster song'].includes((button.getAttribute('aria-label') || '').trim().toLowerCase()));
        if (skipBtn) {
          event.preventDefault();
          event.stopImmediatePropagation();
          ipcRenderer.sendToHost('player-user-skip');
        }
      } catch {}
    }, true);
  }
}, { once: true });

ipcRenderer.on('player-visible', () => {
  // Repaint a webview that was prepared underneath another dashboard tab.
  window.dispatchEvent(new Event('resize'));
});

