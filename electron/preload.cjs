const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('klove', {
  getVersion: () => ipcRenderer.invoke('klove:version'),
  checkForUpdates: () => ipcRenderer.invoke('klove:check-updates'),
})
