// Profil-Datei und Sicherheitskopien – ohne Electron-Abhängigkeiten, damit testbar
const path = require('node:path')
const fs = require('node:fs')

const FILES = {
  profile: 'k-love-profil.json',
  previous: 'k-love-profil.vorher.json',
  'pre-restore': 'k-love-profil.vor-wiederherstellung.json',
  'pre-drop': 'k-love-profil.vor-loeschung.json',
}
/** Unterordner mit einer Kopie pro Tag (Stand beim ersten Speichern des Tages) */
const DAILY_DIR = 'Verlauf'
const DAILY_KEEP = 7
const DAILY_RE = /^k-love-profil-(\d{4}-\d{2}-\d{2})\.json$/
/** Ab so vielen Dramen wird ein starker Rückgang extra gesichert */
const DROP_MIN = 5

const pad = (n) => String(n).padStart(2, '0')
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Anzahl Dramen in einer Profildatei (oder -1, wenn nicht lesbar) */
function dramaCount(file) {
  try {
    const b = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(b.dramas) ? b.dramas.length : -1
  } catch {
    return -1
  }
}

function fileInfo(dir, name, kind) {
  const file = path.join(dir, name)
  if (!fs.existsSync(file)) return null
  const st = fs.statSync(file)
  return { name, kind, date: st.mtime.toISOString(), size: st.size, dramas: dramaCount(file) }
}

function dailyNames(dir) {
  try {
    return fs
      .readdirSync(path.join(dir, DAILY_DIR))
      .filter((n) => DAILY_RE.test(n))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

function listFiles(dir) {
  const fixed = Object.entries(FILES).map(([kind, name]) => fileInfo(dir, name, kind))
  const daily = dailyNames(dir).map((n) => fileInfo(dir, `${DAILY_DIR}/${n}`, 'daily'))
  return [...fixed, ...daily].filter(Boolean)
}

/** Nur bekannte Dateinamen dürfen gelesen werden */
function isReadableName(name) {
  if (typeof name !== 'string') return false
  if (Object.values(FILES).includes(name)) return true
  const m = name.match(/^Verlauf\/(.+)$/)
  return !!m && DAILY_RE.test(m[1])
}

function writeAtomic(file, data) {
  fs.writeFileSync(file + '.tmp', data, 'utf8')
  fs.renameSync(file + '.tmp', file)
}

/** Tageskopie des bisherigen Profils anlegen (einmal pro Tag) und alte Kopien aufräumen */
function rotateDaily(dir, file, now) {
  if (!fs.existsSync(file)) return
  const dailyDir = path.join(dir, DAILY_DIR)
  fs.mkdirSync(dailyDir, { recursive: true })
  const target = path.join(dailyDir, `k-love-profil-${localDay(now)}.json`)
  if (!fs.existsSync(target)) fs.copyFileSync(file, target)
  for (const old of dailyNames(dir).slice(DAILY_KEEP)) {
    try {
      fs.unlinkSync(path.join(dailyDir, old))
    } catch {
      /* egal */
    }
  }
}

/**
 * kind 'profile': Profil aktualisieren, der bisherige Inhalt wird zu „vorher“ (und ggf. zur Tageskopie).
 *   Ohne force wird ein Profil mit Dramen nie durch ein leeres ersetzt.
 *   Fallen mehr als die Hälfte der Dramen weg, bleibt der alte Stand zusätzlich als „vor-loeschung“ erhalten.
 * kind 'pre-restore': Stand vor einer Wiederherstellung festhalten.
 */
function writeProfile(dir, json, kind, force, now = new Date()) {
  if (typeof json !== 'string' || !json.startsWith('{')) throw new Error('Ungültige Sicherung')
  if (kind !== 'profile' && kind !== 'pre-restore') throw new Error('Unbekannte Art')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, FILES[kind])
  if (kind === 'profile') {
    const incoming = (JSON.parse(json).dramas ?? []).length
    const existing = dramaCount(file)
    if (!force && incoming === 0 && existing > 0) return { name: FILES.profile, dir, skipped: true }
    rotateDaily(dir, file, now)
    if (existing >= DROP_MIN && incoming < existing / 2) fs.copyFileSync(file, path.join(dir, FILES['pre-drop']))
    if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dir, FILES.previous))
  }
  writeAtomic(file, json)
  return { name: FILES[kind], dir, skipped: false }
}

module.exports = { FILES, DAILY_DIR, DAILY_KEEP, dramaCount, listFiles, isReadableName, writeProfile, localDay }
