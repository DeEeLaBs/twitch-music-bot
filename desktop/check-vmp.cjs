const { app, BrowserWindow, components } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { initializeDrm } = require('./drm.cjs');
const { withDeadline } = require('./playerExecution.cjs');
const output = path.join(__dirname, 'vmp-check-result.json');
const finish = result => { fs.writeFileSync(output, JSON.stringify(result, null, 2)); app.exit(result.error ? 1 : 0); };
setTimeout(() => finish({ error: 'test-timeout' }), 85000).unref();
app.whenReady().then(async () => {
  if (!(await initializeDrm(components)).ready) return finish({ error: 'drm-unavailable' });
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  await win.loadURL('https://castlabs.github.io/wv-vmp-lab/');
  await withDeadline(win.webContents.mainFrame.executeJavaScript(`document.querySelector('#backendSelect').value='https://proxy.widevine.com/proxy';document.querySelector('#loadContentBtn').click();`, true));
  let attempts = 0;
  const timer = setInterval(async () => {
    try {
      const state = await withDeadline(win.webContents.mainFrame.executeJavaScript(`(()=>{const text=document.querySelector('#logBox').textContent;const v=document.querySelector('video');return {platform:[...new Set(text.match(/PLATFORM_[A-Z_]+/g)||[])],seconds:v.currentTime,mediaError:v.error?.code||0,licenseFailure:/403|401|LICENSE_REQUEST_FAILED/.test(text)};})()`));
      if (state.seconds > 12 || ++attempts >= 20) { clearInterval(timer); finish(state); }
    } catch { clearInterval(timer); finish({ error: 'test-failed' }); }
  }, 2000);
}).catch(() => finish({ error: 'test-load-failed' }));
