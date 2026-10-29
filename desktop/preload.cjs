const { contextBridge, ipcRenderer } = require('electron');
const desktopApi = {
  tab: name => ipcRenderer.invoke('prototype:tab', name),
  provider: name => ipcRenderer.invoke('prototype:provider', name),
  command: (name, value) => ipcRenderer.invoke('prototype:command', name, value),
  setLayout: layout => ipcRenderer.invoke('desktop:layout', layout),
  onState: callback => ipcRenderer.on('prototype:state', (_event, state) => callback(state))
};
contextBridge.exposeInMainWorld('desktop', desktopApi);
contextBridge.exposeInMainWorld('prototype', desktopApi);
