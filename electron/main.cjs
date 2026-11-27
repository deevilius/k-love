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
  // Für „Feedback senden“ – bewusst ohne Pfade oder Benutzernamen, das Issue ist öffentlich
  ipcMain.handle('klove:diagnostics', () => ({
    version: app.getVersion(),
    os: `Windows ${process.getSystemVersion()} (${process.arch})`,
    hasProfile: listFiles(readConfig().dir).some((f) => f.kind === 'profile'),
  }))
  ipcMain.handle('klove:youtube-find-ost', (_e, title) => findYoutubeOst(title))
  ipcMain.handle('klove:youtube-playlist-items', (_e, listId) => youtubePlaylistItems(listId))
  setupAdblock()
  setupBackup()

  createWindow()
  setupUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// ---------- Werbeblocker (für eingebettete YouTube-Videos) ----------
// Filterlisten (EasyList, EasyPrivacy …) werden zwischengespeichert und wöchentlich erneuert.

const PREFS_FILE = () => path.join(app.getPath('userData'), 'prefs.json')
const ENGINE_FILE = () => path.join(app.getPath('userData'), 'adblock-engine.bin')
const ENGINE_MAX_AGE = 7 * 24 * 60 * 60 * 1000

function readPrefs() {
  try {
    return { adblock: true, ...JSON.parse(fs.readFileSync(PREFS_FILE(), 'utf8')) }
  } catch {
    return { adblock: true }
  }
}
function writePrefs(p) {
  fs.mkdirSync(path.dirname(PREFS_FILE()), { recursive: true })
  fs.writeFileSync(PREFS_FILE(), JSON.stringify(p, null, 2))
}

let blockerPromise = null

function loadBlocker() {
  blockerPromise ??= (async () => {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron')
    const file = ENGINE_FILE()
    const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < ENGINE_MAX_AGE
    if (!fresh) {
      try {
        const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(net.fetch)
        await fs.promises.writeFile(file, blocker.serialize())
        return blocker
      } catch {
        /* offline → unten die alte Kopie verwenden */
      }
    }
    return ElectronBlocker.fromPrebuiltAdsAndTracking(net.fetch, { path: file, read: fs.promises.readFile, write: fs.promises.writeFile })
  })().catch((e) => {
    blockerPromise = null // beim nächsten Einschalten erneut versuchen
    throw e
  })
  return blockerPromise
}

async function setAdblock(enabled) {
  try {
    const blocker = await loadBlocker()
    const ses = session.defaultSession
    if (enabled && !blocker.isBlockingEnabled(ses)) blocker.enableBlockingInSession(ses)
    if (!enabled && blocker.isBlockingEnabled(ses)) blocker.disableBlockingInSession(ses)
    return true
  } catch (e) {
    console.warn('Werbeblocker nicht verfügbar:', e?.message ?? e)
    return false
  }
}

function setupAdblock() {
  ipcMain.handle('klove:adblock-get', () => readPrefs().adblock)
  ipcMain.handle('klove:adblock-set', async (_e, enabled) => {
    writePrefs({ ...readPrefs(), adblock: !!enabled })
    await setAdblock(!!enabled)
    return !!enabled
  })
  if (readPrefs().adblock) void setAdblock(true)
}

// ---------- OST-Suche auf YouTube (ohne API-Schlüssel: Suchseite auslesen) ----------

const OST_RE = /\bost\b|soundtrack|사운드트랙/i

// Eigene Sitzung nur für diese Abfragen: Ohne Antwort auf die Cookie-Abfrage zeigt YouTube in der EU
// statt Playlists die Seite „Before you continue“. SOCS=CAI = nur notwendige Cookies.
let ytSession = null
async function youtubeSession() {
  if (!ytSession) {
    const ses = session.fromPartition('klove-youtube-search')
    await ses.cookies.set({ url: 'https://www.youtube.com', domain: '.youtube.com', name: 'SOCS', value: 'CAI', secure: true, expirationDate: Date.now() / 1000 + 365 * 24 * 3600 })
    ytSession = ses
  }
  return ytSession
}

/** Liest die Seitendaten (ytInitialData) einer YouTube-Seite */
async function youtubeData(url) {
  const ses = await youtubeSession()
  const res = await ses.fetch(url, { headers: { 'Accept-Language': 'en-US,en;q=0.9' }, credentials: 'include' })
  if (!res.ok) return null
  const m = (await res.text()).match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s)
  return m ? JSON.parse(m[1]) : null
}

const youtubeResults = (query, filter) =>
  youtubeData(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${filter ? `&sp=${filter}` : ''}`)

const ytText = (t) => t?.simpleText ?? t?.runs?.map((r) => r.text).join('') ?? t?.content ?? ''

/** Alle Treffer in Dokument-Reihenfolge sammeln (iterativ, die Struktur ist sehr tief verschachtelt) */
function collect(root, pick) {
  const out = []
  const stack = [root]
  while (stack.length) {
    const n = stack.pop()
    if (!n || typeof n !== 'object') continue
    const hit = pick(n)
    if (hit) out.push(hit)
    const children = Array.isArray(n) ? n : Object.values(n)
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i])
  }
  return out
}

const pickPlaylist = (n) => {
  if (n.playlistRenderer?.playlistId) return { kind: 'playlist', id: n.playlistRenderer.playlistId, title: ytText(n.playlistRenderer.title) }
  const l = n.lockupViewModel
  if (l?.contentId && l.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST')
    return { kind: 'playlist', id: l.contentId, title: ytText(l.metadata?.lockupMetadataViewModel?.title) }
  return null
}
const pickVideo = (n) => (n.videoRenderer?.videoId ? { kind: 'video', id: n.videoRenderer.videoId, title: ytText(n.videoRenderer.title) } : null)

const normTitle = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * Erst eine OST-Playlist, sonst ein OST-Video zum Drama-Titel.
 * Ein Treffer muss „OST“/„Soundtrack“ und den Drama-Titel enthalten – lieber nichts als etwas Falsches.
 */
async function findYoutubeOst(title) {
  if (typeof title !== 'string' || !title.trim() || title.length > 200) return null
  const t = normTitle(title)
  const fits = (hit) => OST_RE.test(hit.title) && normTitle(hit.title).includes(t)
  const query = `${title.trim()} OST`
  try {
    const pl = collect(await youtubeResults(query, 'EgIQAw%3D%3D'), pickPlaylist).find(fits)
    if (pl) return pl
    return collect(await youtubeResults(query), pickVideo).find(fits) ?? null
  } catch {
    return null
  }
}

const pickPlaylistVideo = (n) => {
  const r = n.playlistVideoRenderer
  if (r?.videoId) return { id: r.videoId, title: ytText(r.title), channel: ytText(r.shortBylineText) }
  const l = n.lockupViewModel
  if (l?.contentId && l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
    const md = l.metadata?.lockupMetadataViewModel
    return { id: l.contentId, title: ytText(md?.title), channel: ytText(md?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text) }
  }
  return null
}

/** Die ersten Videos einer YouTube-Playlist ({ id, title, channel }[]), bei Fehlern [] */
async function youtubePlaylistItems(listId, max = 25) {
  if (typeof listId !== 'string' || !/^[\w-]{10,64}$/.test(listId)) return []
  try {
    const items = collect(await youtubeData(`https://www.youtube.com/playlist?list=${listId}`), pickPlaylistVideo)
    const seen = new Set()
    return items.filter((v) => v.title && !seen.has(v.id) && seen.add(v.id)).slice(0, max)
  } catch {
    return []
  }
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
      // Startmusik ohne vorherigen Klick abspielen
      autoplayPolicy: 'no-user-gesture-required',
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
  // Beim Schließen noch einmal sichern (der Renderer liefert die Daten aus IndexedDB)
  win.on('close', (e) => {
    if (quitBackupDone) return
    e.preventDefault()
    backupBeforeQuit().finally(() => win?.destroy())
  })
  win.on('closed', () => (win = null))
}

// ---------- Updates über GitHub Releases ----------
// Nichts passiert ohne Zustimmung: Die App meldet ein Update samt Changelog an die Oberfläche,
// geladen und installiert wird erst nach „Jetzt aktualisieren“.
let autoUpdater = null
let updateState = { status: 'idle' }
// KLOVE_FAKE_UPDATE=1 → erfundenes Update 9.9.9; =old → tut so, als wäre 0.1.0 installiert, und lädt die echten Notizen nach
const FAKE = !app.isPackaged && ['1', 'old'].includes(process.env.KLOVE_FAKE_UPDATE) ? process.env.KLOVE_FAKE_UPDATE : false

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch }
  if (win && !win.isDestroyed()) win.webContents.send('klove:update-state', updateState)
}

/** Release-Notizen kommen von GitHub als HTML – für die Oberfläche in reinen Text umwandeln */
function htmlToText(html) {
  if (!html) return ''
  return String(html)
    .replace(/\r\n/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*(p|li|h[1-6]|ul|ol|div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/^- /gm, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}(?=• )/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeNotes(info) {
  const n = info?.releaseNotes
  const list = Array.isArray(n) ? n.map((x) => ({ version: x.version, text: htmlToText(x.note) })) : [{ version: info?.version, text: htmlToText(n) }]
  return list.filter((x) => x.version).sort((a, b) => compareVersions(b.version, a.version))
}
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

function onUpdateAvailable(info) {
  if (updateState.status === 'downloading' || updateState.status === 'ready') return
  const notes = normalizeNotes(info)
  setUpdateState({ status: 'available', version: info.version, releaseDate: info.releaseDate, notes, notesIncomplete: false, percent: 0, message: undefined })
  // GitHubs Release-Feed enthält nur die letzten 10 Releases. Ist er voll, fehlen bei großen Sprüngen ältere Versionen.
  if (notes.length >= FEED_LIMIT) void completeNotes(info.version, notes)
}

const GH_REPO = 'deevilius/k-love'
const FEED_LIMIT = FAKE === 'old' ? 1 : 10
const currentVersion = () => (FAKE === 'old' ? '0.1.0' : app.getVersion())

/** Fehlende ältere Release-Notizen über die GitHub-API nachladen (ohne Anmeldung, 60 Abrufe/Stunde reichen) */
async function completeNotes(latest, notes) {
  const current = currentVersion()
  const have = new Set(notes.map((n) => n.version))
  try {
    const res = await net.fetch(`https://api.github.com/repos/${GH_REPO}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub antwortet mit ${res.status}`)
    const releases = await res.json()
    const extra = releases
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({ version: String(r.tag_name).replace(/^v/, ''), text: htmlToText(r.body) }))
      // have wächst mit, damit doppelte Releases desselben Tags nur einmal erscheinen
      .filter((n) => /^\d+\.\d+\.\d+$/.test(n.version) && !have.has(n.version) && have.add(n.version))
      .filter((n) => compareVersions(n.version, current) > 0 && compareVersions(n.version, latest) <= 0)
    if (updateState.version !== latest) return // inzwischen ist ein anderes Update gemeldet
    const all = [...notes, ...extra].sort((a, b) => compareVersions(b.version, a.version))
    // Bei 100 Releases kann auch die API-Seite voll sein
    setUpdateState({ notes: all, notesIncomplete: releases.length >= 100 })
  } catch (e) {
    console.error('Ältere Release-Notizen nicht geladen:', e?.message ?? e)
    if (updateState.version === latest) setUpdateState({ notesIncomplete: true })
  }
}

function setupUpdater() {
  ipcMain.handle('klove:update-get-state', () => ({ ...updateState, currentVersion: currentVersion() }))
  ipcMain.handle('klove:update-download', () => downloadUpdate())
  ipcMain.handle('klove:update-install', () => installUpdate())

  if (FAKE) {
    setTimeout(() => checkForUpdates(false), 3000)
    return
  }
  if (!app.isPackaged) return
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch (e) {
    console.error('electron-updater fehlt', e)
    return
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.fullChangelog = true

  autoUpdater.on('update-available', onUpdateAvailable)
  autoUpdater.on('download-progress', (p) => setUpdateState({ status: 'downloading', percent: Math.round(p.percent ?? 0) }))
  autoUpdater.on('update-downloaded', () => setUpdateState({ status: 'ready', percent: 100 }))
  autoUpdater.on('error', (err) => {
    console.error('Update-Fehler:', err?.message ?? err)
    // Fehler beim Prüfen im Hintergrund nicht anzeigen, nur beim Herunterladen
    if (updateState.status === 'downloading') setUpdateState({ status: 'error', message: String(err?.message ?? err) })
  })

  checkForUpdates(false)
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000)
}

async function checkForUpdates(_manual) {
  if (FAKE === 'old') {
    onUpdateAvailable({
      version: app.getVersion(),
      releaseDate: new Date().toISOString(),
      releaseNotes: [{ version: app.getVersion(), note: '<p>Nur dieser Eintrag kam aus dem Feed, die älteren werden nachgeladen.</p>' }],
    })
    return { status: 'available', version: app.getVersion() }
  }
  if (FAKE) {
    onUpdateAvailable({
      version: '9.9.9',
      releaseDate: new Date().toISOString(),
      releaseNotes: [
        { version: '9.9.9', note: '<ul><li>✨ Testversion: neuer Update-Dialog</li><li>🐛 Fehler behoben</li></ul>' },
        { version: '9.9.8', note: '<p>Ältere Version, die du übersprungen hättest &amp; mehr.</p>' },
      ],
    })
    return { status: 'available', version: '9.9.9' }
  }
  if (!autoUpdater) return { status: 'dev' }
  if (updateState.status === 'downloading' || updateState.status === 'ready') return { status: 'available', version: updateState.version }
  try {
    const r = await autoUpdater.checkForUpdates()
    if (r?.isUpdateAvailable) return { status: 'available', version: r.updateInfo?.version }
    if (updateState.status === 'available') setUpdateState({ status: 'idle' })
    return { status: 'current' }
  } catch (e) {
    return { status: 'error', message: String(e?.message ?? e) }
  }
}

async function downloadUpdate() {
  if (updateState.status !== 'available' && updateState.status !== 'error') return
  setUpdateState({ status: 'downloading', percent: 0, message: undefined })
  if (FAKE) {
    for (let p = 10; p <= 100; p += 10) {
      await new Promise((r) => setTimeout(r, 250))
      setUpdateState({ percent: p })
    }
    setUpdateState({ status: 'ready' })
    return
  }
  try {
    await autoUpdater.downloadUpdate()
  } catch (e) {
    setUpdateState({ status: 'error', message: String(e?.message ?? e) })
  }
}

async function installUpdate() {
  if (updateState.status !== 'ready') return
  await backupBeforeQuit()
  if (FAKE) {
    console.log('[KLOVE_FAKE_UPDATE] Profil gespeichert, jetzt würde installiert und neu gestartet.')
    app.quit()
    return
  }
  // still installieren und danach K-Love wieder starten
  autoUpdater.quitAndInstall(true, true)
}

// ---------- Profil-Datei (automatische Sicherung) ----------
// Alle Daten liegen in EINER Datei, die bei jeder Änderung aktualisiert wird.
// Dazu höchstens zwei Sicherheitskopien: der vorherige Stand und der Stand vor der letzten Wiederherstellung.
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'backup-config.json')
const FILES = {
  profile: 'k-love-profil.json',
  previous: 'k-love-profil.vorher.json',
  'pre-restore': 'k-love-profil.vor-wiederherstellung.json',
}

function readConfig() {
  const def = { dir: path.join(app.getPath('documents'), 'K-Love'), enabled: true }
  try {
    return { ...def, ...JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')) }
  } catch {
    return def
  }
}
function writeConfig(c) {
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true })
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(c, null, 2))
}

/** Anzahl Dramen in einer Profildatei (oder -1, wenn nicht lesbar) */
function dramaCount(file) {
  try {
    const b = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(b.dramas) ? b.dramas.length : -1
  } catch {
    return -1
  }
}

function listFiles(dir) {
  return Object.entries(FILES)
    .map(([kind, name]) => {
      const file = path.join(dir, name)
      if (!fs.existsSync(file)) return null
      const st = fs.statSync(file)
      return { name, kind, date: st.mtime.toISOString(), size: st.size, dramas: dramaCount(file) }
    })
    .filter(Boolean)
}

function writeAtomic(file, data) {
  fs.writeFileSync(file + '.tmp', data, 'utf8')
  fs.renameSync(file + '.tmp', file)
}

function setupBackup() {
  ipcMain.handle('klove:backup-config', () => readConfig())
  ipcMain.handle('klove:backup-set-enabled', (_e, enabled) => {
    const c = { ...readConfig(), enabled: !!enabled }
    writeConfig(c)
    return c
  })
  ipcMain.handle('klove:backup-choose-dir', async () => {
    const c = readConfig()
    const r = await dialog.showOpenDialog(win, {
      title: 'Ordner für dein K-Love-Profil wählen',
      defaultPath: c.dir,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (r.canceled || !r.filePaths[0]) return c
    const next = { ...c, dir: r.filePaths[0] }
    writeConfig(next)
    return next
  })
  ipcMain.handle('klove:backup-open-dir', async () => {
    const { dir } = readConfig()
    fs.mkdirSync(dir, { recursive: true })
    return shell.openPath(dir)
  })
  ipcMain.handle('klove:backup-list', () => listFiles(readConfig().dir))
  ipcMain.handle('klove:backup-read', (_e, name) => {
    if (!Object.values(FILES).includes(name)) throw new Error('Ungültiger Dateiname')
    return fs.readFileSync(path.join(readConfig().dir, name), 'utf8')
  })
  /**
   * kind 'profile': Profil aktualisieren, der bisherige Inhalt wird zu „vorher“.
   *   Ohne force wird ein Profil mit Dramen nie durch ein leeres ersetzt (Schutz z. B. nach „Alle Daten löschen“).
   * kind 'pre-restore': Stand vor einer Wiederherstellung festhalten.
   */
  ipcMain.handle('klove:backup-write', (_e, json, kind, force) => {
    if (typeof json !== 'string' || !json.startsWith('{')) throw new Error('Ungültige Sicherung')
    if (kind !== 'profile' && kind !== 'pre-restore') throw new Error('Unbekannte Art')
    const { dir } = readConfig()
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, FILES[kind])
    if (kind === 'profile') {
      const incoming = (JSON.parse(json).dramas ?? []).length
      if (!force && incoming === 0 && dramaCount(file) > 0) return { name: FILES.profile, dir, skipped: true }
      if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dir, FILES.previous))
    }
    writeAtomic(file, json)
    return { name: FILES[kind], dir, skipped: false }
  })
}

let quitBackupDone = false
function backupBeforeQuit() {
  if (quitBackupDone) return Promise.resolve()
  quitBackupDone = true
  if (!win || win.isDestroyed() || !readConfig().enabled) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(done, 3000)
    function done() {
      clearTimeout(timer)
      ipcMain.removeListener('klove:backup-done', done)
      resolve()
    }
    ipcMain.once('klove:backup-done', done)
    win.webContents.send('klove:backup-now')
  })
}
