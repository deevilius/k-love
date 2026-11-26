import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { restoreBackup, saveSettings, useDramas, useSettings, validateBackup } from '../db/repo'
import type { BackupFile } from '../electron'
import { getAutoBackupError, onAutoBackupError, runAutoBackup } from '../lib/autoBackup'

const REMIND_AFTER_DAYS = 14
const SNOOZE_DAYS = 3

/** Schmales Banner, wenn die letzte Sicherung zu alt ist oder die automatische Sicherung fehlschlägt */
export function BackupReminder() {
  const settings = useSettings()
  const dramas = useDramas()
  const [error, setError] = useState(getAutoBackupError)
  const [busy, setBusy] = useState(false)
  useEffect(() => onAutoBackupError(() => setError(getAutoBackupError())), [])

  if (dramas && !dramas.length) return <ProfileOffer />
  if (!dramas?.length) return null
  const days = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null
  const tooOld = days === null || days > REMIND_AFTER_DAYS
  const snoozed = settings.backupReminderSnoozedUntil && new Date(settings.backupReminderSnoozedUntil).getTime() > Date.now()
  if (!error && (!tooOld || snoozed)) return null

  const backupNow = async () => {
    setBusy(true)
    try {
      await runAutoBackup(true)
    } catch (e) {
      alert('Sicherung fehlgeschlagen: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const snooze = () => saveSettings({ backupReminderSnoozedUntil: new Date(Date.now() + SNOOZE_DAYS * 86400000).toISOString() })

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
    >
      <span className="flex-1">
        {error ? (
          <>
            ⚠️ Automatische Sicherung fehlgeschlagen – ist der Sicherungsordner erreichbar? <span className="opacity-70">({error})</span>
          </>
        ) : days === null ? (
          '💾 Du hast noch keine Sicherung deiner Dramen erstellt.'
        ) : (
          `💾 Deine letzte Sicherung ist ${days} Tage alt.`
        )}
      </span>
      <button className="btn-primary px-3 py-1 text-sm" onClick={backupNow} disabled={busy}>
        {busy ? 'Sichere …' : 'Jetzt sichern'}
      </button>
      {error ? (
        <Link to="/settings#backup" className="btn-ghost px-3 py-1 text-sm">
          Einstellungen
        </Link>
      ) : (
        <button className="btn-ghost px-3 py-1 text-sm" onClick={snooze}>
          Später
        </button>
      )}
    </div>
  )
}

/** Desktop-App ohne Daten, aber im Profilordner liegt ein Profil → Laden anbieten (z. B. neuer Rechner) */
function ProfileOffer() {
  const [profile, setProfile] = useState<BackupFile | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    window.klove?.backup
      .list()
      .then((files) => setProfile(files.find((f) => f.kind === 'profile' && f.dramas > 0) ?? null))
      .catch(() => {})
  }, [])
  if (!profile) return null

  const load = async () => {
    setBusy(true)
    try {
      const b = validateBackup(JSON.parse(await window.klove!.backup.read(profile.name)))
      await restoreBackup(b, 'replace')
    } catch (e) {
      alert('Profil konnte nicht geladen werden: ' + (e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-pink-200 bg-pink-50 px-4 py-2.5 text-sm text-pink-900 dark:border-pink-400/20 dark:bg-pink-400/10 dark:text-pink-100"
    >
      <span className="flex-1">
        💕 Im Profilordner liegt dein K-Love-Profil mit {profile.dramas} Dramen (gespeichert {new Date(profile.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}).
      </span>
      <button className="btn-primary px-3 py-1 text-sm" onClick={load} disabled={busy}>
        {busy ? 'Lade …' : 'Profil laden'}
      </button>
      <button className="btn-ghost px-3 py-1 text-sm" onClick={() => setProfile(null)}>
        Nein danke
      </button>
    </div>
  )
}
