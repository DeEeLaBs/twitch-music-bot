const RESTART_EXIT_CODE = 42;

function installLocalRestart({ app, ipcMain, getWindow, launchFlag, relaunchOptions }) {
  let requested = false;
  const enabled = () => !app.isPackaged && launchFlag === '1' && !!relaunchOptions;
  const trusted = event => {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
    try {
      const url = new URL(event.senderFrame.url);
      return url.origin === 'http://127.0.0.1:3000' && url.pathname === '/';
    } catch { return false; }
  };

  ipcMain.handle('desktop:can-restart-local', event => enabled() && trusted(event));
  ipcMain.handle('desktop:restart-local', event => {
    if (!enabled() || !trusted(event)) throw new Error('Lokaler Neustart nicht verfügbar.');
    if (requested) return { ok: true };
    // Schedule the replacement before closing any windows. Electron starts it
    // after this process exits, independently of the original launcher's code.
    app.relaunch(relaunchOptions);
    requested = true;
    setTimeout(() => {
      app.quit();
    }, 100);
    return { ok: true };
  });
  return { attachWindow(window) {
    if (!enabled()) return;
    const attach = contents => contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat || !input.control || !input.alt || input.shift || input.meta || input.key?.toLowerCase() !== 'r') return;
      if (window !== getWindow() || window.isDestroyed() || !window.isFocused()) return;
      if (!trusted({sender:window.webContents,senderFrame:window.webContents.mainFrame})) return;
      event.preventDefault();
      window.webContents.send('desktop:request-restart-local');
    });
    attach(window.webContents);
    window.webContents.on('did-attach-webview', (_event, contents) => attach(contents));
  } };
}

module.exports = { installLocalRestart, RESTART_EXIT_CODE };
