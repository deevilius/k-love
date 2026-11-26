import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { discardUndoSnapshot, restoreBackup, undoRestore, useAllSongs, useDramas, useSettings, useUndoSnapshot, validateBackup, type Backup, type RestoreResult } from '../db/repo'
import { downloadBackup, getAutoBackupError, isDesktop, onAutoBackupError, runAutoBackup, writePreRestoreCopy } from '../lib/autoBackup'
import type { BackupConfig } from '../electron'

const fmtDate = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Öffnen einer Sicherung → Dialog → Wiederherstellen; jede Stelle, die das anbietet, nutzt diesen Hook */
function useRestoreFlow() {
  const [pending, setPending] = useState<{ backup: Backup; source: string } | null>(null)
  const [result, setResult] = useState('')

  const openFile = async (file: File) => {
    try {
      setPending({ backup: validateBackup(JSON.parse(await file.text())), source: file.name })
    } catch (e) {
      alert(e instanceof SyntaxError ? 'Die Datei ist keine gültige JSON-Datei.' : (e as Error).message)
    }
  }

  const openStored = async (name: string) => {
    try {
      setPending({ backup: validateBackup(JSON.parse(await window.klove!.backup.read(name))), source: name })
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const doRestore = async (mode: 'replace' | 'merge') => {
    if (!pending) return
    try {
      await writePreRestoreCopy()
      const r = await restoreBackup(pending.backup, mode)
      setResult(describe(r, mode))
    } catch (e) {
      alert('Fehler: ' + (e as Error).message)
    } finally {
      setPending(null)
    }
  }

  const dialog = pending && <RestoreDialog backup={pending.backup} source={pending.source} onCancel={() => setPending(null)} onRestore={doRestore} />
  return { openFile, openStored, result, setResult, dialog }
}

/** Oberste Karte der Einstellungen: Speicherstatus + Profilordner */
export function BackupSection() {
  const settings = useSettings()
  const undo = useUndoSnapshot()
  const flow = useRestoreFlow()
  const desktop = isDesktop()

  const days = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null
  const when = days === 0 ? 'heute' : `vor ${days} Tag(en)`

  const doUndo = async () => {
    if (!confirm('Den Stand von vor der letzten Wiederherstellung zurückholen?')) return
    try {
      await undoRestore()
      flow.setResult('↩️ Wiederherstellung rückgängig gemacht.')
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <section className="card space-y-3 p-5" id="backup">
      <h2 className="h-display text-lg font-bold">💾 Profil</h2>
      <p className="text-sm font-semibold">
        {days === null
          ? '⚠️ Noch nicht gesichert.'
          : days > 14
            ? `⚠️ Letzte Sicherung vor ${days} Tagen.`
            : desktop
              ? `✅ Wird automatisch gespeichert · zuletzt ${when}`
              : `✅ Letzte Sicherung ${when}`}
      </p>

      {desktop ? <ProfileFolder onRestore={flow.openStored} /> : <FileButtons onOpen={flow.openFile} />}

      {flow.result && <p className="text-sm font-semibold text-emerald-600">{flow.result}</p>}

      {undo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm dark:bg-white/5">
          <span className="flex-1">
            Vor der letzten Wiederherstellung wurde dein vorheriger Stand ({undo.dramas.length} Dramen, {fmtDate(undo.exportedAt)}) aufgehoben.
          </span>
          <button className="btn-outline px-3 py-1 text-sm" onClick={doUndo}>
            ↩️ Rückgängig machen
          </button>
          <button className="btn-ghost px-3 py-1 text-sm" onClick={() => (discardUndoSnapshot(), flow.setResult(''))}>
            Verwerfen
          </button>
        </div>
      )}

      {flow.dialog}
    </section>
  )
}

function FileButtons({ onOpen }: { onOpen: (f: File) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-outline" onClick={() => downloadBackup()}>
        ⬇️ Als Datei speichern
      </button>
      <button className="btn-outline" onClick={() => fileRef.current?.click()}>
        ⬆️ Aus Datei laden
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onOpen(e.target.files[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}

function ProfileFolder({ onRestore }: { onRestore: (name: string) => void }) {
  const api = window.klove!.backup
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [error, setError] = useState(getAutoBackupError)

  useEffect(() => {
    // Automatisches Speichern ist immer an – früher abschaltbar, daher hier wieder einschalten
    api.config().then(async (c) => setConfig(c.enabled ? c : await api.setEnabled(true)))
  }, [api])
  useEffect(() => onAutoBackupError(() => setError(getAutoBackupError())), [])

  const changeDir = async () => {
    const before = config?.dir
    const next = await api.chooseDir()
    setConfig(next)
    // Im neuen Ordner sofort ein Profil anlegen – liegt dort schon eins, zuerst das Laden anbieten
    if (next.dir !== before) {
      const existing = (await api.list()).find((f) => f.kind === 'profile')
      if (existing) onRestore(existing.name)
      else await runAutoBackup(true).catch(() => {})
    }
  }

  if (!config) return null
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-rose-50 px-2 py-1 text-xs dark:bg-white/5" title={config.dir}>
          {config.dir}
        </code>
        <button className="btn-outline px-3 py-1 text-sm" onClick={changeDir}>
          📁 Ordner ändern
        </button>
        <button className="btn-ghost px-3 py-1 text-sm" onClick={() => api.openDir()}>
          Öffnen
        </button>
      </div>
      <p className="text-xs text-stone-500 dark:text-rose-100/60">Tipp: Ein Ordner in OneDrive oder Dropbox legt dein Profil automatisch in die Cloud.</p>
      {error && <p className="text-sm font-semibold text-red-600">⚠️ Profil konnte nicht gespeichert werden: {error}</p>}
    </div>
  )
}

function describe(r: RestoreResult, mode: 'replace' | 'merge') {
  if (mode === 'replace') return `✅ Daten ersetzt: ${r.added} Dramen, ${r.songsAdded} Songs.`
  const parts = [`${r.added} neu`, `${r.updated} aktualisiert`]
  if (r.skipped) parts.push(`${r.skipped} unverändert (hier neuer oder gleich)`)
  return `✅ Zusammengeführt: ${parts.join(', ')}${r.songsAdded ? `, ${r.songsAdded} Songs ergänzt` : ''}.`
}

function RestoreDialog({
  backup,
  source,
  onCancel,
  onRestore,
}: {
  backup: Backup
  source: string
  onCancel: () => void
  onRestore: (mode: 'replace' | 'merge') => Promise<void>
}) {
  const dramas = useDramas()
  const songs = useAllSongs()
  const [busy, setBusy] = useState(false)
  const run = async (mode: 'replace' | 'merge') => {
    setBusy(true)
    await onRestore(mode)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  // Portal: .card nutzt backdrop-blur, das würde position:fixed auf die Karte begrenzen
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="restore-title" className="card w-full max-w-lg space-y-4 bg-white p-5 shadow-xl dark:bg-[#1a1220]" onClick={(e) => e.stopPropagation()}>
        <h3 id="restore-title" className="h-display text-lg font-bold">
          Sicherung wiederherstellen
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="font-normal"></th>
              <th className="font-semibold">Sicherung</th>
              <th className="font-semibold">Jetzt auf diesem Gerät</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-stone-500">Stand</td>
              <td>{fmtDate(backup.exportedAt)}</td>
              <td>–</td>
            </tr>
            <tr>
              <td className="text-stone-500">Dramen</td>
              <td className="font-bold">{backup.dramas.length}</td>
              <td className="font-bold">{dramas?.length ?? '…'}</td>
            </tr>
            <tr>
              <td className="text-stone-500">Songs</td>
              <td>{backup.songs.length}</td>
              <td>{songs?.length ?? '…'}</td>
            </tr>
          </tbody>
        </table>
        <p className="truncate text-xs text-stone-500" title={source}>
          Datei: {source}
        </p>

        <div className="space-y-2">
          <button className="btn-primary w-full justify-center" disabled={busy} onClick={() => run('merge')}>
            Zusammenführen (empfohlen)
          </button>
          <p className="text-xs text-stone-500 dark:text-rose-100/60">Fehlende Dramen und Songs werden ergänzt. Ein vorhandenes Drama wird nur ersetzt, wenn es in der Sicherung neuer ist.</p>
          <button className="btn-danger w-full justify-center border border-red-200 dark:border-red-500/30" disabled={busy} onClick={() => run('replace')}>
            Aktuelle Daten durch die Sicherung ersetzen
          </button>
          <p className="text-xs text-stone-500 dark:text-rose-100/60">Alles auf diesem Gerät wird durch den Stand der Sicherung ersetzt.</p>
        </div>
        <p className="rounded-lg bg-rose-50 p-2 text-xs dark:bg-white/5">🛟 In beiden Fällen wird dein jetziger Stand vorher aufgehoben und kann danach mit „Rückgängig machen“ zurückgeholt werden.</p>
        <div className="flex justify-end">
          <button className="btn-ghost" disabled={busy} onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
