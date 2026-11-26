import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { saveSettings, useSettings } from '../db/repo'
import type { UpdateState } from '../electron'

const DAY = 86400000

/** Aktueller Update-Zustand aus dem Hauptprozess */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    const api = window.klove?.update
    if (!api) return
    let alive = true
    api.getState().then((s) => alive && setState(s))
    const off = api.onState((s) => setState((prev) => ({ ...prev, ...s })))
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

// Einstellungen können den Dialog gezielt öffnen – unabhängig von „später“/„überspringen“
const openListeners = new Set<() => void>()
export function showUpdateDialog() {
  openListeners.forEach((l) => l())
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' }) : '')

export function UpdateDialog() {
  const state = useUpdateState()
  const settings = useSettings()
  const [forced, setForced] = useState(false)
  const accepted = useRef(false)

  useEffect(() => {
    const l = () => setForced(true)
    openListeners.add(l)
    return () => void openListeners.delete(l)
  }, [])

  // Nach „Jetzt aktualisieren“ direkt installieren, sobald der Download fertig ist
  useEffect(() => {
    if (state.status === 'ready' && accepted.current) void window.klove?.update.install()
  }, [state.status])

  const api = window.klove?.update
  if (!api || state.status === 'idle' || !state.version) return null

  const snoozed = settings.updateSnoozedUntil && new Date(settings.updateSnoozedUntil).getTime() > Date.now()
  const skipped = settings.skippedUpdateVersion === state.version
  const busy = state.status === 'downloading' || (state.status === 'ready' && accepted.current)
  if (!forced && !busy && state.status !== 'ready' && (snoozed || skipped)) return null

  const close = () => setForced(false)
  const later = async (days: number) => {
    await saveSettings({ updateSnoozedUntil: new Date(Date.now() + days * DAY).toISOString() })
    close()
  }
  const skip = async () => {
    await saveSettings({ skippedUpdateVersion: state.version, updateSnoozedUntil: undefined })
    close()
  }
  const updateNow = async () => {
    accepted.current = true
    await saveSettings({ updateSnoozedUntil: undefined, skippedUpdateVersion: undefined })
    if (state.status === 'ready') await api.install()
    else await api.download()
  }

  const notes = state.notes?.length ? state.notes : [{ version: state.version, text: '' }]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="update-title" className="card flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 bg-white p-5 shadow-xl dark:bg-[#1a1220]">
        <div>
          <h3 id="update-title" className="h-display text-xl font-bold">
            ✨ K-Love {state.version} ist da
          </h3>
          <p className="text-sm text-stone-500 dark:text-rose-100/60">
            Du hast Version {state.currentVersion ?? '?'}
            {state.releaseDate && ` · veröffentlicht am ${fmtDate(state.releaseDate)}`}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl bg-rose-50 p-3 text-sm dark:bg-white/5">
          {notes.map((n) => (
            <section key={n.version}>
              <h4 className="mb-1 font-bold text-pink-700 dark:text-pink-300">Version {n.version}</h4>
              <p className="whitespace-pre-line">{n.text || 'Keine Beschreibung vorhanden.'}</p>
            </section>
          ))}
        </div>

        {state.status === 'downloading' && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-rose-100 dark:bg-white/10">
              <div className="h-full bg-pink-600 transition-all" style={{ width: `${state.percent ?? 0}%` }} />
            </div>
            <p className="text-sm">Wird geladen … {state.percent ?? 0} %</p>
          </div>
        )}
        {state.status === 'ready' && accepted.current && <p className="text-sm font-semibold">Dein Profil wird gespeichert, K-Love startet gleich neu …</p>}
        {state.status === 'error' && <p className="text-sm font-semibold text-red-600">⚠️ Download fehlgeschlagen: {state.message}</p>}

        {!busy && (
          <div className="space-y-2">
            <button className="btn-primary w-full" onClick={updateNow}>
              {state.status === 'ready' ? 'Jetzt neu starten und installieren' : state.status === 'error' ? 'Erneut versuchen' : 'Jetzt aktualisieren'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-outline" onClick={() => later(1)}>
                Morgen erinnern
              </button>
              <button className="btn-outline" onClick={() => later(7)}>
                In einer Woche
              </button>
            </div>
            <button className="btn-ghost w-full text-sm" onClick={skip}>
              Diese Version überspringen
            </button>
            <p className="text-center text-xs text-stone-500 dark:text-rose-100/60">
              Ohne deine Zustimmung wird nichts installiert. In den Einstellungen findest du das Update jederzeit wieder.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
