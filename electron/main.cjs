// K-Love Desktop – Electron-Hauptprozess
const { app, BrowserWindow, protocol, net, shell, session, dialog, ipcMain, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const SCHEME = 'app'
const HOST = 'k-love'
const DIST = path.join(__dirname, '..', 'dist')
const DEV_URL = process.env.VITE_DEV_SERVER_URL

// Feste Herkunft (app://k-love) → IndexedDB bleibt über Updates erhalten
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

let win = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(start)
}

function start() {
  protocol.handle(SCHEME, (req) => {
    const { pathname } = new URL(req.url)
    let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html')
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  // YouTube verweigert Einbettungen ohne Referer (Fehler 153)
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.youtube-nocookie.com/*', 'https://*.youtube.com/*', 'https://*.googlevideo.com/*', 'https://*.ytimg.com/*'] },
    (details, cb) => {
      details.requestHeaders.Referer = 'https://k-love.app/'
      cb({ requestHeaders: details.requestHeaders })
    },
  )

  ipcMain.handle('klove:check-updates', () => checkForUpdates(true))
  ipcMain.handle('klove:version', () => app.getVersion())

  createWindow()
  setupUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'K-Love',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1220' : '#fff1f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.removeMenu()

  // Links mit target=_blank (YouTube-/Spotify-Suche, TMDB …) im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const internal = url.startsWith(`${SCHEME}://${HOST}`) || (DEV_URL && url.startsWith(DEV_URL))
    if (!internal) {
      e.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
    }
  })

  win.loadURL(DEV_URL || `${SCHEME}://${HOST}/index.html`)
  win.on('closed', () => (win = null))
}

// ---------- Auto-Update über GitHub Releases ----------
let autoUpdater = null
let manualCheck = false

function setupUpdater() {
  if (!app.isPackaged) return
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch (e) {
    console.error('electron-updater fehlt', e)
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('Update-Fehler:', err?.message ?? err)
    if (manualCheck && win) {
      dialog.showMessageBox(win, { type: 'warning', message: 'Update-Prüfung fehlgeschlagen', detail: 'Bist du mit dem Internet verbunden?' })
    }
    manualCheck = false
  })
  autoUpdater.on('update-not-available', () => {
    if (manualCheck && win) dialog.showMessageBox(win, { type: 'info', message: 'K-Love ist auf dem neuesten Stand 💕', detail: `Version ${app.getVersion()}` })
    manualCheck = false
  })
  autoUpdater.on('update-downloaded', async (info) => {
    manualCheck = false
    if (!win) return
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      cancelId: 1,
      message: `Neue Version ${info.version} ist bereit ✨`,
      detail: 'K-Love startet kurz neu, deine Daten bleiben erhalten. Bei „Später“ wird das Update beim nächsten Schließen installiert.',
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })

  checkForUpdates(false)
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000)
}

async function checkForUpdates(manual) {
  if (!autoUpdater) return { status: 'dev' }
  manualCheck = manual
  try {
    const r = await autoUpdater.checkForUpdates()
    const available = !!r?.isUpdateAvailable
    return { status: available ? 'downloading' : 'current', version: r?.updateInfo?.version }
  } catch (e) {
    return { status: 'error', message: String(e?.message ?? e) }
  }
}
