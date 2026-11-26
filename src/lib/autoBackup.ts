import { liveQuery } from 'dexie'
import { db } from '../db/db'
import { exportBackup, getSettings, saveSettings, type Backup } from '../db/repo'
import { downloadBlob } from './util'

/** Profil wird kurz nach jeder Änderung geschrieben; das Intervall ist nur die Rückfallebene */
const AFTER_CHANGE = 5 * 1000
const INTERVAL = 5 * 60 * 1000
const FIRST_DELAY = 10 * 1000

export const isDesktop = () => !!window.klove?.backup

const toJson = (b: Backup) => JSON.stringify(b, null, 2)

/** Prüfsumme über die Nutzdaten – ohne Zeitstempel und Sicherungs-Metadaten */
function contentHash(b: Backup): string {
  const { lastBackupAt: _a, lastAutoBackupHash: _b, backupReminderSnoozedUntil: _c, ...settings } = b.settings
  const s = JSON.stringify([b.dramas, b.songs, settings])
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `${s.length.toString(36)}-${(h >>> 0).toString(36)}`
}

/** Zuletzt aufgetretener Fehler beim automatischen Sichern (für Banner/Einstellungen) */
let lastError: string | null = null
const listeners = new Set<() => void>()
export const getAutoBackupError = () => lastError
export function onAutoBackupError(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
function setError(e: string | null) {
  lastError = e
  listeners.forEach((l) => l())
}

/**
 * Aktualisiert die Profildatei der Desktop-App.
 * force=false: überspringt, wenn sich seit dem letzten Schreiben nichts geändert hat,
 * und ersetzt nie ein Profil mit Dramen durch leere Daten.
 * Gibt den Dateinamen zurück oder null, wenn nichts geschrieben wurde.
 */
export async function runAutoBackup(force = false): Promise<string | null> {
  const api = window.klove?.backup
  if (!api) return null
  try {
    const b = await exportBackup()
    const hash = contentHash(b)
    const settings = await getSettings()
    // Unverändert und Profildatei vorhanden (z. B. nicht gelöscht oder Ordner gewechselt) → nichts zu tun
    if (!force && settings.lastAutoBackupHash === hash && (await api.list()).some((f) => f.kind === 'profile')) {
      // Profil ist aktuell – nur vermerken, damit keine Erinnerung erscheint
      if (!settings.lastBackupAt || Date.now() - new Date(settings.lastBackupAt).getTime() > 86400000) await saveSettings({ lastBackupAt: b.exportedAt })
      setError(null)
      return null
    }
    if (!force && !b.dramas.length && !b.songs.length) return null
    const { name, skipped } = await api.write(toJson(b), 'profile', force)
    if (skipped) {
      console.warn('Profil enthält Dramen, die aktuellen Daten sind leer – Profil wurde nicht überschrieben.')
      return null
    }
    await saveSettings({ lastBackupAt: b.exportedAt, lastAutoBackupHash: hash })
    setError(null)
    return name
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    setError(msg)
    if (force) throw e
    console.error('Automatische Sicherung fehlgeschlagen', e)
    return null
  }
}

/** Kopie des aktuellen Stands vor einer Wiederherstellung (nur Desktop, Fehler werden ignoriert) */
export async function writePreRestoreCopy() {
  const api = window.klove?.backup
  if (!api) return
  try {
    await api.write(toJson(await exportBackup()), 'pre-restore')
  } catch (e) {
    console.error('Kopie vor Wiederherstellung fehlgeschlagen', e)
  }
}

/** Sicherung als Datei herunterladen (Web und Desktop) */
export async function downloadBackup() {
  const b = await exportBackup()
  downloadBlob(new Blob([toJson(b)], { type: 'application/json' }), `k-love-backup-${b.exportedAt.slice(0, 10)}.json`)
  await saveSettings({ lastBackupAt: b.exportedAt })
}

/** Startet die automatische Sicherung der Desktop-App. Gibt eine Aufräumfunktion zurück. */
export function startAutoBackup(): () => void {
  const api = window.klove?.backup
  if (!api) return () => {}
  const tick = async () => {
    if ((await api.config()).enabled) await runAutoBackup()
  }
  const first = setTimeout(tick, FIRST_DELAY)
  const timer = setInterval(tick, INTERVAL)
  // Bei jeder Änderung an Dramen oder Songs entprellt speichern (erste Meldung = Startzustand, überspringen)
  let debounce: ReturnType<typeof setTimeout> | undefined
  let initial = true
  const sub = liveQuery(() => Promise.all([db.dramas.toArray(), db.songs.toArray()])).subscribe(() => {
    if (initial) return void (initial = false)
    clearTimeout(debounce)
    debounce = setTimeout(tick, AFTER_CHANGE)
  })
  // Der Hauptprozess fragt nur, wenn die automatische Sicherung aktiv ist
  const off = api.onRequest(async () => void (await runAutoBackup()))
  return () => {
    clearTimeout(first)
    clearInterval(timer)
    clearTimeout(debounce)
    sub.unsubscribe()
    off()
  }
}
