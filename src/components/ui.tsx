import { useEffect, useRef, useState } from 'react'
import { STATUS_LABELS, type Drama, type WatchStatus } from '../types'
import { cx, fmtRating, overall } from '../lib/util'
import { stepEpisode } from '../db/repo'
import { toast } from './Dialogs'

/** Schließt ein offenes Menü/Popover bei Klick außerhalb von `ref` oder bei Esc */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && closeRef.current()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref])
}

/**
 * Bilder aus dem Netz laufen in der Desktop-App über den lokalen Bild-Zwischenspeicher
 * (klove-img://) – so bleiben Poster auch offline und nach Änderungen beim Anbieter erhalten.
 */
export function imageSrc(url: string | undefined): string | undefined {
  if (!url || !window.klove || !/^https:\/\//i.test(url)) return url
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(url)))
  return `klove-img://cache/${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

/** −1 / +1 Folge; nach der letzten Folge wird das Drama automatisch „Fertig“ */
export function EpisodeStepper({ drama: d, compact }: { drama: Drama; compact?: boolean }) {
  const cur = d.currentEpisode ?? 0
  const step = async (delta: 1 | -1, e: React.MouseEvent) => {
    // Kann in einem Link stecken (Leiste „Schaue gerade“)
    e.preventDefault()
    e.stopPropagation()
    if (await stepEpisode(d.id, delta)) toast(`🎉 „${d.title}“ fertig geschaut!`)
  }
  const btn = cx(
    'grid place-items-center rounded-full font-bold transition active:scale-95 disabled:opacity-40',
    compact ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-lg',
  )
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={cx(btn, 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-white/10 dark:text-rose-100')} disabled={cur <= 0} onClick={(e) => step(-1, e)} aria-label={`${d.title}: eine Folge zurück`} title="Eine Folge zurück">
        −
      </button>
      {!compact && (
        <span className="min-w-24 text-center text-sm font-semibold tabular-nums" aria-live="polite">
          Folge {cur}
          {d.episodes ? ` / ${d.episodes}` : ''}
        </span>
      )}
      <button type="button" className={cx(btn, 'bg-pink-600 text-white hover:bg-pink-700')} disabled={!!d.episodes && cur >= d.episodes} onClick={(e) => step(1, e)} aria-label={`${d.title}: eine Folge weiter`} title="Eine Folge weiter">
        +1
      </button>
    </div>
  )
}

const STATUS_STYLE: Record<WatchStatus, string> = {
  watchlist: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200',
  watching: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
  'on-hold': 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200',
  dropped: 'bg-stone-200 text-stone-600 dark:bg-white/10 dark:text-stone-300',
}

export function StatusBadge({ status, className }: { status: WatchStatus; className?: string }) {
  return <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS_STYLE[status], className)}>{STATUS_LABELS[status]}</span>
}

/** Bewertung 0–10 als 5 Herzen mit halben Schritten */
export function RatingHearts({
  value,
  onChange,
  size = 'md',
  label = 'Bewertung',
}: {
  value: number | undefined
  onChange?: (v: number | undefined) => void
  size?: 'sm' | 'md' | 'lg'
  /** Name für Screenreader */
  label?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  const px = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-2xl'
  // Zuletzt gesetzter Wert – die Datenbank meldet Änderungen verzögert, schnelle Tastendrücke sollen sich addieren
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  // Tastatur: Pfeile ±1, Pos1/Ende, Entf = keine Note
  const onKey = (e: React.KeyboardEvent) => {
    if (!onChange) return
    const v = latest.current ?? 0
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? Math.min(10, v + 1)
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? Math.max(0, v - 1)
          : e.key === 'Home'
            ? 1
            : e.key === 'End'
              ? 10
              : e.key === 'Delete' || e.key === 'Backspace'
                ? 0
                : null
    if (next === null) return
    e.preventDefault()
    latest.current = next || undefined
    onChange(latest.current)
  }
  const a11y = onChange
    ? {
        role: 'slider' as const,
        tabIndex: 0,
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': 10,
        'aria-valuenow': value ?? 0,
        'aria-valuetext': value === undefined ? 'keine Note' : `${fmtRating(value)} von 10`,
        onKeyDown: onKey,
      }
    : { role: 'img' as const, 'aria-label': value === undefined ? `${label}: keine Note` : `${label}: ${fmtRating(value)} von 10` }
  return (
    <div
      className={cx('inline-flex select-none items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-pink-400', px)}
      onMouseLeave={() => setHover(null)}
      {...a11y}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const full = shown >= i * 2
        const half = !full && shown >= i * 2 - 1
        return (
          <span key={i} className="relative inline-block leading-none">
            <span className="text-rose-200 dark:text-white/15">♥</span>
            <span
              className="absolute inset-0 overflow-hidden text-pink-500"
              style={{ width: full ? '100%' : half ? '50%' : '0%' }}
            >
              ♥
            </span>
            {onChange && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  aria-label={`${i * 2 - 1} von 10`}
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i * 2 - 1)}
                  onClick={() => onChange(value === i * 2 - 1 ? undefined : i * 2 - 1)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  aria-label={`${i * 2} von 10`}
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i * 2)}
                  onClick={() => onChange(value === i * 2 ? undefined : i * 2)}
                />
              </>
            )}
          </span>
        )
      })}
      {onChange && <span className="ml-2 w-10 text-sm font-bold text-stone-500 tabular-nums dark:text-rose-100/70">{fmtRating(shown || undefined)}</span>}
    </div>
  )
}

export function ScoreBubble({ drama, className }: { drama: Drama; className?: string }) {
  const s = overall(drama)
  if (s === undefined) return null
  return (
    <span className={cx('inline-flex items-center gap-0.5 rounded-full bg-pink-600 px-2 py-0.5 text-xs font-extrabold text-white shadow', className)}>
      ♥ {fmtRating(s)}
    </span>
  )
}

export function Poster({ drama, className }: { drama: Pick<Drama, 'posterUrl' | 'title'>; className?: string }) {
  // Nicht ladbar (offline und noch nicht zwischengespeichert) → Platzhalter mit Titel
  const [failed, setFailed] = useState<string | null>(null)
  if (drama.posterUrl && failed !== drama.posterUrl)
    return (
      <img
        src={imageSrc(drama.posterUrl)}
        alt={drama.title}
        loading="lazy"
        onError={() => setFailed(drama.posterUrl!)}
        className={cx('aspect-[2/3] rounded-xl object-cover', className)}
      />
    )
  return (
    <div
      className={cx(
        '@container flex aspect-[2/3] items-center justify-center rounded-xl bg-gradient-to-br from-pink-300 via-rose-300 to-purple-400 p-1 text-center @[6rem]:p-3 dark:from-pink-900 dark:via-rose-900 dark:to-purple-900',
        className,
      )}
    >
      <span className="h-display line-clamp-4 text-[10px] leading-tight font-bold @[6rem]:text-sm @[9rem]:text-lg text-white drop-shadow">{drama.title || '?'}</span>
    </div>
  )
}

export function Progress({ drama }: { drama: Drama }) {
  if (!drama.episodes) return null
  const cur = drama.status === 'completed' ? drama.episodes : (drama.currentEpisode ?? 0)
  const pct = Math.min(100, Math.round((cur / drama.episodes) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-rose-100 dark:bg-white/10" title={`${cur} / ${drama.episodes} Episoden`}>
      <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) onChange([...new Set([...value, ...parts])])
    setText('')
  }
  return (
    <div className="input flex flex-wrap items-center gap-1.5 py-1.5">
      {value.map((v) => (
        <span key={v} className="chip gap-1">
          {v}
          <button type="button" className="text-rose-400 hover:text-rose-700" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`${v} entfernen`}>
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent py-0.5 outline-none"
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={add}
      />
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="w-full text-center text-5xl">{icon}</div>
      <h2 className="h-display text-xl font-bold">{title}</h2>
      <div className="max-w-md text-sm text-stone-500 dark:text-rose-100/70">{children}</div>
    </div>
  )
}
