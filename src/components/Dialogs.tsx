/**
 * Eigene Dialoge und Hinweise statt der Windows-Fenster von confirm()/alert().
 * confirmDialog/alertDialog liefern ein Promise; <DialogHost /> steht einmal in App.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/util'

interface DialogRequest {
  id: number
  title?: string
  message: string
  /** Aufzählung unter der Nachricht (z. B. nicht gefundene Titel) */
  list?: string[]
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface Toast {
  id: number
  message: string
  kind: 'success' | 'error' | 'info'
}

let dialogs: DialogRequest[] = []
let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
let snapshot = { dialogs, toasts }
const getSnapshot = () => snapshot
const update = () => {
  snapshot = { dialogs, toasts }
  emit()
}

export interface ConfirmOptions {
  title?: string
  list?: string[]
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    dialogs = [...dialogs, { id: ++seq, message, confirmLabel: 'OK', cancelLabel: 'Abbrechen', ...opts, resolve }]
    update()
  })
}

export function alertDialog(message: string, opts: Omit<ConfirmOptions, 'cancelLabel' | 'danger'> = {}): Promise<void> {
  return new Promise((resolve) => {
    dialogs = [...dialogs, { id: ++seq, message, confirmLabel: 'OK', ...opts, cancelLabel: undefined, resolve: () => resolve() }]
    update()
  })
}

export function toast(message: string, kind: Toast['kind'] = 'success', ms = 4000) {
  const t = { id: ++seq, message, kind }
  toasts = [...toasts, t].slice(-4)
  update()
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    update()
  }, ms)
}

function close(d: DialogRequest, ok: boolean) {
  dialogs = dialogs.filter((x) => x.id !== d.id)
  update()
  d.resolve(ok)
}

export function DialogHost() {
  const { dialogs, toasts } = useSyncExternalStore(subscribe, getSnapshot)
  const d = dialogs[0]
  return createPortal(
    <>
      {d && <DialogView key={d.id} d={d} />}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto max-w-md rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-lg',
              t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'info' ? 'bg-stone-800 text-white' : 'bg-emerald-600 text-white',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </>,
    document.body,
  )
}

function DialogView({ d }: { d: DialogRequest }) {
  const okRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // Bei gefährlichen Aktionen liegt der Fokus auf „Abbrechen“
    ;(d.danger ? cancelRef.current : okRef.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(d, false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [d])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => close(d, false)}>
      <div
        role={d.cancelLabel ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`dlg-${d.id}-msg`}
        className="card w-full max-w-md space-y-4 bg-white p-5 shadow-xl dark:bg-[#1a1220]"
        onClick={(e) => e.stopPropagation()}
      >
        {d.title && <h3 className="h-display text-lg font-bold">{d.title}</h3>}
        <p id={`dlg-${d.id}-msg`} className="text-sm whitespace-pre-line">
          {d.message}
        </p>
        {d.list && d.list.length > 0 && (
          <ul className="max-h-48 list-inside list-disc overflow-y-auto rounded-xl bg-rose-50 p-3 text-sm dark:bg-white/5">
            {d.list.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          {d.cancelLabel && (
            <button ref={cancelRef} className="btn-ghost" onClick={() => close(d, false)}>
              {d.cancelLabel}
            </button>
          )}
          <button
            ref={okRef}
            className={d.danger ? 'btn border border-red-200 bg-red-600 text-white hover:bg-red-700 dark:border-red-500/30' : 'btn-primary'}
            onClick={() => close(d, true)}
          >
            {d.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
