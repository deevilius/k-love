import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { discardUndoSnapshot, restoreBackup, undoRestore, useAllSongs, useDramas, usePlaylists, useSettings, useUndoSnapshot, validateBackup, type Backup, type RestoreResult } from '../db/repo'
import { getAutoBackupError, onAutoBackupError, runAutoBackup, writePreRestoreCopy } from '../lib/autoBackup'
import type { BackupConfig, BackupFile } from '../electron'
import { alertDialog, confirmDialog } from './Dialogs'

const fmtDate = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Öffnen einer Sicherung → Dialog → Wiederherstellen; jede Stelle, die das anbietet, nutzt diesen Hook */
function useRestoreFlow() {
  const [pending, setPending] = useState<{ backup: Backup; source: string } | null>(null)
  const [result, setResult] = useState('')

  const openFile = async (file: File) => {
    try {
      setPending({ backup: validateBackup(JSON.parse(await file.text())), source: file.name })
    } catch (e) {
      void alertDialog(e instanceof SyntaxError ? 'Die Datei ist keine gültige JSON-Datei.' : (e as Error).message)
    }
  }

  const openStored = async (name: string) => {
    try {
      setPending({ backup: validateBackup(JSON.parse(await window.klove!.backup.read(name))), source: name })
    } catch (e) {
      void alertDialog((e as Error).message)
    }
  }

  const doRestore = async (mode: 'replace' | 'merge') => {
    if (!pending) return
    try {
      await writePreRestoreCopy()
      const r = await restoreBackup(pending.backup, mode)
      setResult(describe(r, mode))
    } catch (e) {
      void alertDialog('Fehler: ' + (e as Error).message)
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

  const days = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null
  const when = days === 0 ? 'heute' : `vor ${days} Tag(en)`

  const doUndo = async () => {
    if (!(await confirmDialog('Den Stand von vor der letzten Wiederherstellung zurückholen?', { confirmLabel: 'Zurückholen' }))) return
    try {
      await undoRestore()
      flow.setResult('↩️ Wiederherstellung rückgängig gemacht.')
    } catch (e) {
      void alertDialog((e as Error).message)
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
            : `✅ Wird automatisch gespeichert · zuletzt ${when}`}
      </p>

      {window.klove && <ProfileFolder onRestore={flow.openStored} />}
      <LoadFileButton onOpen={flow.openFile} />
      {window.klove && <StoredCopies onRestore={flow.openStored} />}

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

/** Eine K-Love-Sicherung (.json) von irgendwo laden, z. B. eine umgewandelte Liste oder ein Profil von einem anderen Rechner */
function LoadFileButton({ onOpen }: { onOpen: (f: File) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-wrap gap-2">
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

const COPY_LABELS: Record<BackupFile['kind'], string> = {
  profile: 'Aktuelles Profil',
  previous: 'Stand davor',
  'pre-restore': 'Vor der letzten Wiederherstellung',
  'pre-drop': 'Vor dem Löschen vieler Dramen',
  daily: 'Tageskopie',
}

/** Sicherheitskopien im Profilordner – aufklappbar, mit „Wiederherstellen“ */
function StoredCopies({ onRestore }: { onRestore: (name: string) => void }) {
  const [files, setFiles] = useState<BackupFile[] | null>(null)
  const load = () =>
    window
      .klove!.backup.list()
      .then((l) => setFiles(l.filter((f) => f.kind !== 'profile')))
      .catch(() => setFiles([]))
  return (
    <details className="rounded-xl bg-rose-50/60 p-3 text-sm dark:bg-white/5" onToggle={(e) => (e.currentTarget.open ? void load() : undefined)}>
      <summary className="cursor-pointer font-semibold">🛟 Sicherheitskopien</summary>
      <p className="mt-2 text-xs text-stone-500 dark:text-rose-100/60">
        K-Love hebt den vorherigen Stand, eine Kopie pro Tag (die letzten 7) und den Stand vor dem Löschen vieler Dramen auf.
      </p>
      {files === null ? null : files.length === 0 ? (
        <p className="mt-2 text-xs">Noch keine Kopien vorhanden.</p>
      ) : (
        <ul className="mt-2 divide-y divide-rose-100 dark:divide-white/5">
          {files.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{COPY_LABELS[f.kind]}</span>
                <span className="text-stone-500 dark:text-rose-100/60">
                  {' '}
                  · {fmtDate(f.date)} · {f.dramas >= 0 ? `${f.dramas} Dramen` : 'nicht lesbar'}
                </span>
              </span>
              <button className="btn-outline px-3 py-1 text-xs" disabled={f.dramas < 0} onClick={() => onRestore(f.name)}>
                Wiederherstellen …
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function describe(r: RestoreResult, mode: 'replace' | 'merge') {
  if (mode === 'replace') return `✅ Daten ersetzt: ${r.added} Dramen, ${r.songsAdded} Songs, ${r.playlistsAdded} Playlists.`
  const parts = [`${r.added} neu`, `${r.updated} aktualisiert`]
  if (r.skipped) parts.push(`${r.skipped} unverändert (hier neuer, gleich oder gelöscht)`)
  if (r.removed) parts.push(`${r.removed} entfernt (in der Sicherung gelöscht)`)
  const songs = [r.songsAdded && `${r.songsAdded} Songs ergänzt`, r.songsUpdated && `${r.songsUpdated} Songs aktualisiert`].filter(Boolean)
  return `✅ Zusammengeführt: ${parts.join(', ')}${songs.length ? `, ${songs.join(', ')}` : ''}${r.playlistsAdded ? `, ${r.playlistsAdded} Playlists ergänzt` : ''}.`
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
  const playlists = usePlaylists()
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
            <tr>
              <td className="text-stone-500">Playlists</td>
              <td>{backup.playlists?.length ?? 0}</td>
              <td>{playlists?.length ?? '…'}</td>
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
          <p className="text-xs text-stone-500 dark:text-rose-100/60">Fehlendes wird ergänzt, bei Dramen, Songs und Playlists gewinnt die neuere Fassung. Was du hier gelöscht hast, kommt nicht zurück.</p>
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
