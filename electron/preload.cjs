const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('klove', {
  getVersion: () => ipcRenderer.invoke('klove:version'),
  checkForUpdates: () => ipcRenderer.invoke('klove:check-updates'),
  diagnostics: () => ipcRenderer.invoke('klove:diagnostics'),
  update: {
    getState: () => ipcRenderer.invoke('klove:update-get-state'),
    download: () => ipcRenderer.invoke('klove:update-download'),
    install: () => ipcRenderer.invoke('klove:update-install'),
    onState: (cb) => {
      const handler = (_e, state) => cb(state)
      ipcRenderer.on('klove:update-state', handler)
      return () => ipcRenderer.removeListener('klove:update-state', handler)
    },
  },
  backup: {
    config: () => ipcRenderer.invoke('klove:backup-config'),
    setEnabled: (enabled) => ipcRenderer.invoke('klove:backup-set-enabled', enabled),
    chooseDir: () => ipcRenderer.invoke('klove:backup-choose-dir'),
    openDir: () => ipcRenderer.invoke('klove:backup-open-dir'),
    list: () => ipcRenderer.invoke('klove:backup-list'),
    read: (name) => ipcRenderer.invoke('klove:backup-read', name),
    write: (json, kind, force) => ipcRenderer.invoke('klove:backup-write', json, kind, !!force),
    /** Hauptprozess bittet vor dem Beenden um eine Sicherung */
    onRequest: (cb) => {
      const handler = async () => {
        try {
          await cb()
        } finally {
          ipcRenderer.send('klove:backup-done')
        }
      }
      ipcRenderer.on('klove:backup-now', handler)
      return () => ipcRenderer.removeListener('klove:backup-now', handler)
    },
  },
})
