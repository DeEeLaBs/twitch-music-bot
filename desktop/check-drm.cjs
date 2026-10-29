const { app, BrowserWindow, components } = require('electron');
const { initializeDrm } = require('./drm.cjs');
app.whenReady().then(async () => {
  const startup = await initializeDrm(components);
  if (!startup.ready) console.error('Widevine initialization:', startup.reason);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    const ready = new Promise(resolve => win.webContents.once('dom-ready', resolve));
    win.loadURL('https://music.youtube.com/').catch(() => {});
    await ready;
    const result = await win.webContents.mainFrame.executeJavaScript(`(async () => {
      try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{initDataTypes:['cenc'],audioCapabilities:[{contentType:'audio/mp4; codecs="mp4a.40.2"'}]}]);
        return 'Widevine available';
      } catch (error) { return 'Widevine unavailable: ' + error.name; }
    })()`);
    console.log(result);
    require('node:fs').writeFileSync(require('node:path').join(__dirname, 'drm-check-result.txt'), result);
  } catch (error) { console.error('DRM check failed:', error.message); process.exitCode = 1; }
  finally { win.destroy(); app.quit(); }
});
setTimeout(() => { console.error('DRM check timed out'); app.exit(1); }, 90000).unref();
