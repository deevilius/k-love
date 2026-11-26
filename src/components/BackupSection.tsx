import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { discardUndoSnapshot, restoreBackup, undoRestore, useAllSongs, useDramas, useSettings, useUndoSnapshot, validateBackup, type Backup, type RestoreResult } from '../db/repo'
import { downloadBackup, getAutoBackupError, isDesktop, onAutoBackupError, runAutoBackup, writePreRestoreCopy } from '../lib/autoBackup'
import type { BackupConfig, BackupFile } from '../electron'

const fmtDate = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export function BackupSection() {
  const settings = useSettings()
  const undo = useUndoSnapshot()
  const [pending, setPending] = useState<{ backup: Backup; source: string } | null>(null)
  const [result, setResult] = useState('')
  const [listVersion, setListVersion] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const days = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null

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
      setListVersion((v) => v + 1)
    } catch (e) {
      alert('Fehler: ' + (e as Error).message)
    } finally {
      setPending(null)
    }
  }

  const doUndo = async () => {
    if (!confirm('Den Stand von vor der letzten Wiederherstellung zurückholen?')) return
    try {
      await undoRestore()
      setResult('↩️ Wiederherstellung rückgängig gemacht.')
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <section className="card space-y-3 p-5" id="backup">
      <h2 className="h-display text-lg font-bold">💾 Sicherung</h2>
      <p className="text-sm text-stone-600 dark:text-rose-100/70">
        K-Love hält dein Profil automatisch in einem Ordner deiner Wahl aktuell. Zusätzlich kannst du eine Sicherung als einzelne Datei speichern, z. B. zum
        Weitergeben.
      </p>
      <p className="text-sm font-semibold">
        {days === null ? '⚠️ Noch keine Sicherung erstellt.' : days > 14 ? `⚠️ Letzte Sicherung vor ${days} Tagen.` : `✅ Letzte Sicherung ${days === 0 ? 'heute' : `vor ${days} Tag(en)`}.`}
      </p>

      {isDesktop() && <DesktopBackup onRestore={openStored} listVersion={listVersion} />}

      <div className="flex flex-wrap gap-2">
        <button className="btn-outline" onClick={() => downloadBackup()}>
          ⬇️ Als Datei speichern
        </button>
        <button className="btn-outline" onClick={() => fileRef.current?.click()}>
          ⬆️ Aus Datei wiederherstellen
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0]).finally(() => (e.target.value = ''))} />
      </div>

      {result && <p className="text-sm font-semibold text-emerald-600">{result}</p>}

      {undo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm dark:bg-white/5">
          <span className="flex-1">
            Vor der letzten Wiederherstellung wurde dein vorheriger Stand ({undo.dramas.length} Dramen, {fmtDate(undo.exportedAt)}) aufgehoben.
          </span>
          <button className="btn-outline px-3 py-1 text-sm" onClick={doUndo}>
            ↩️ Rückgängig machen
          </button>
          <button className="btn-ghost px-3 py-1 text-sm" onClick={() => (discardUndoSnapshot(), setResult(''))}>
            Verwerfen
          </button>
        </div>
      )}

      {pending && <RestoreDialog backup={pending.backup} source={pending.source} onCancel={() => setPending(null)} onRestore={doRestore} />}
    </section>
  )
}

function describe(r: RestoreResult, mode: 'replace' | 'merge') {
  if (mode === 'replace') return `✅ Daten ersetzt: ${r.added} Dramen, ${r.songsAdded} Songs.`
  const parts = [`${r.added} neu`, `${r.updated} aktualisiert`]
  if (r.skipped) parts.push(`${r.skipped} unverändert (hier neuer oder gleich)`)
  return `✅ Zusammengeführt: ${parts.join(', ')}${r.songsAdded ? `, ${r.songsAdded} Songs ergänzt` : ''}.`
}

function DesktopBackup({ onRestore, listVersion }: { onRestore: (name: string) => void; listVersion: number }) {
  const api = window.klove!.backup
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [files, setFiles] = useState<BackupFile[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState(getAutoBackupError)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setConfig(await api.config())
    setFiles(await api.list())
  }, [api])
  useEffect(() => {
    void refresh()
  }, [refresh, listVersion])
  useEffect(() => onAutoBackupError(() => setError(getAutoBackupError())), [])

  const backupNow = async () => {
    setBusy(true)
    try {
      await runAutoBackup(true)
      setMsg('✅ Profil aktualisiert')
      await refresh()
    } catch (e) {
      setMsg('❌ ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

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
    await refresh()
  }

  if (!config) return null
  const profile = files.find((f) => f.kind === 'profile')
  const copies = files.filter((f) => f.kind !== 'profile')

  return (
    <div className="space-y-3 rounded-xl border border-rose-100 p-3 text-sm dark:border-white/10">
      <p>
        Alle Dramen, Songs und Einstellungen stehen in <b>einer</b> Profildatei, die K-Love bei Änderungen automatisch aktualisiert. Um alles zu sichern
        oder auf einen anderen Rechner mitzunehmen, kopierst du einfach diesen Ordner.
      </p>
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" checked={config.enabled} onChange={async (e) => setConfig(await api.setEnabled(e.target.checked))} />
        Profil automatisch aktualisieren (bei Änderungen und beim Schließen)
      </label>
      <div>
        <span className="label">Profilordner</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-rose-50 px-2 py-1 text-xs dark:bg-white/5" title={config.dir}>
            {config.dir}
          </code>
          <button className="btn-outline px-3 py-1 text-sm" onClick={changeDir}>
            📁 Ordner ändern …
          </button>
          <button className="btn-ghost px-3 py-1 text-sm" onClick={() => api.openDir()}>
            Öffnen
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-rose-100/60">
          Tipp: Wähle einen Ordner in OneDrive oder Dropbox – dann liegt dein Profil automatisch auch in der Cloud.
        </p>
      </div>

      {error && <p className="font-semibold text-red-600">⚠️ Profil konnte nicht gespeichert werden: {error}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-rose-50 px-3 py-2 dark:bg-white/5">
        <span className="flex-1">
          {profile ? (
            <>
              <b>{profile.name}</b> · {profile.dramas >= 0 ? `${profile.dramas} Dramen · ` : ''}gespeichert {fmtDate(profile.date)} · {fmtSize(profile.size)}
            </>
          ) : (
            'Noch kein Profil in diesem Ordner.'
          )}
        </span>
        <button className="btn-outline px-3 py-1 text-sm" onClick={backupNow} disabled={busy}>
          {busy ? 'Speichere …' : '💾 Jetzt speichern'}
        </button>
        {msg && <span>{msg}</span>}
      </div>

      {copies.length > 0 && (
        <div>
          <span className="label">Sicherheitskopien</span>
          <ul className="divide-y divide-rose-100 rounded-xl border border-rose-100 dark:divide-white/5 dark:border-white/10">
            {copies.map((f) => (
              <li key={f.name} className="flex items-center gap-2 px-3 py-1.5">
                <span className="flex-1">
                  {f.kind === 'previous' ? 'Vorheriger Stand' : 'Vor der letzten Wiederherstellung'}
                  <span className="ml-2 text-xs text-stone-500">
                    {fmtDate(f.date)}
                    {f.dramas >= 0 && ` · ${f.dramas} Dramen`}
                  </span>
                </span>
                <button className="btn-ghost px-2 py-0.5 text-sm" onClick={() => onRestore(f.name)}>
                  Wiederherstellen
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-stone-500 dark:text-rose-100/60">Es gibt immer höchstens diese drei Dateien – sie werden überschrieben, nicht angehäuft.</p>
        </div>
      )}
    </div>
  )
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
