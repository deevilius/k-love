import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { emptyDrama, saveDrama, useDrama, useDramas, useRatingCategories } from '../db/repo'
import { PLATFORMS, STATUS_LABELS, STATUS_ORDER, type Drama } from '../types'
import { confirmDialog } from '../components/Dialogs'
import { bestMatch, completeCandidate, searchFreePosters, type PosterCandidate } from '../lib/freePosters'
import { ensureOst } from '../lib/autoOst'
import { avgRating, fmtRating, today } from '../lib/util'
import { Poster, RatingHearts, TagInput } from '../components/ui'

export default function DramaForm() {
  const { id } = useParams()
  const existing = useDrama(id)
  const all = useDramas()
  const nav = useNavigate()
  const categories = useRatingCategories()
  const [d, setD] = useState<Drama | null>(id ? null : emptyDrama())
  const [error, setError] = useState('')
  // Ausgangsstand, um ungespeicherte Änderungen zu erkennen
  const initial = useRef<string | null>(null)
  const saving = useRef(false)
  if (d && initial.current === null) initial.current = JSON.stringify(d)
  const dirty = !!d && initial.current !== JSON.stringify(d)

  useEffect(() => {
    if (id && existing && !d) setD(structuredClone(existing))
  }, [id, existing, d])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving.current && currentLocation.pathname !== nextLocation.pathname)
  const asking = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirmDialog('Du hast ungespeicherte Änderungen. Wirklich verlassen und die Änderungen verwerfen?', {
      confirmLabel: 'Verwerfen',
      cancelLabel: 'Weiter bearbeiten',
      danger: true,
    }).then((ok) => {
      asking.current = false
      if (ok) blocker.proceed()
      else blocker.reset()
    })
  }, [blocker])

  const poster = useAutoPoster(d, setD)

  if (id && existing === undefined && !d) return null
  if (!d) return <p>Drama nicht gefunden.</p>

  const set = <K extends keyof Drama>(k: K, v: Drama[K]) => setD({ ...d, [k]: v })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!d.title.trim()) return setError('Bitte einen Titel eingeben.')
    const dup = all?.find((x) => x.id !== d.id && x.title.trim().toLowerCase() === d.title.trim().toLowerCase())
    if (dup && !(await confirmDialog(`„${dup.title}“ ist schon in deiner Liste. Trotzdem speichern?`, { confirmLabel: 'Trotzdem speichern' }))) return
    const next = { ...d, title: d.title.trim() }
    if (next.status === 'completed' && !next.finishedAt && existing?.status !== 'completed') next.finishedAt = today()
    if (next.status === 'watching' && !next.startedAt) next.startedAt = today()
    await saveDrama(next)
    // OST im Hintergrund suchen – Speichern wartet nicht darauf
    void ensureOst(next).catch(() => {})
    saving.current = true
    nav(`/drama/${d.id}`, { replace: true })
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="h-display text-2xl font-bold">{id ? 'Drama bearbeiten' : 'Neues Drama'}</h1>
        <Link to={id ? `/drama/${id}` : '/'} className="btn-ghost">
          Abbrechen
        </Link>
      </div>

      <div className="card grid gap-5 p-5 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1 text-center">
          <Poster drama={d} className="w-full shadow-md" />
          {poster.status === 'searching' && <p className="text-xs text-stone-500 dark:text-rose-100/60">🔎 Suche Poster …</p>}
          {poster.status === 'none' && <p className="text-xs text-stone-500 dark:text-rose-100/60">Kein Poster gefunden – englische Titel klappen am besten.</p>}
          {poster.canCycle && (
            <button type="button" className="btn-ghost w-full text-xs" onClick={poster.next}>
              🔄 Anderes Poster
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Titel *</label>
            <input className="input text-base font-semibold" value={d.title} onChange={(e) => (set('title', e.target.value), setError(''))} autoFocus={!id} />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
          <div>
            <label className="label">Originaltitel</label>
            <input className="input" value={d.originalTitle ?? ''} onChange={(e) => set('originalTitle', e.target.value || undefined)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jahr</label>
              <input className="input" type="number" value={d.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div>
              <label className="label">Episoden</label>
              <input className="input" type="number" min={1} value={d.episodes ?? ''} onChange={(e) => set('episodes', e.target.value ? Number(e.target.value) : undefined)} />
            </div>
          </div>
          <div>
            <label className="label">Plattform</label>
            <input className="input" list="platforms" value={d.platform ?? ''} onChange={(e) => set('platform', e.target.value || undefined)} />
            <datalist id="platforms">
              {PLATFORMS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={d.status} onChange={(e) => set('status', e.target.value as Drama['status'])}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Bei Episode</label>
              <input
                className="input"
                type="number"
                min={0}
                max={d.episodes}
                value={d.currentEpisode ?? ''}
                onChange={(e) => set('currentEpisode', e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Genres</label>
            <TagInput value={d.genres} onChange={(v) => set('genres', v)} placeholder="Romanze, Komödie … (Enter)" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Schauspieler</label>
            <TagInput value={d.actors} onChange={(v) => set('actors', v)} placeholder="Namen mit Enter hinzufügen" />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="h-display text-lg font-bold">Meine Bewertung</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="font-semibold">{label}</span>
              <RatingHearts label={label} value={d.ratings[key]} onChange={(v) => set('ratings', { ...d.ratings, [key]: v })} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rose-100 pt-4 dark:border-white/10">
          <div>
            <span className="font-bold">Gesamtnote</span>
            <span className="ml-2 text-xs text-stone-500">leer = Durchschnitt ({fmtRating(avgRating(d))})</span>
          </div>
          <RatingHearts label="Gesamtnote" value={d.overallRating} onChange={(v) => set('overallRating', v)} size="lg" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-pink-600" checked={d.favorite} onChange={(e) => set('favorite', e.target.checked)} />
          ⭐ Lieblingsdrama
        </label>
      </div>

      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="label">Begonnen am</label>
          <input className="input" type="date" value={d.startedAt ?? ''} onChange={(e) => set('startedAt', e.target.value || undefined)} />
        </div>
        <div>
          <label className="label">Beendet am</label>
          <input className="input" type="date" value={d.finishedAt ?? ''} onChange={(e) => set('finishedAt', e.target.value || undefined)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Tags</label>
          <TagInput value={d.tags} onChange={(v) => set('tags', v)} placeholder="z. B. Lieblings-OST, Second Lead Syndrome, Rewatch" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notizen</label>
          <textarea className="input min-h-28" value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} placeholder="Was hat mir gefallen? Lieblingsszene? …" />
        </div>
      </div>

      <div className="sticky bottom-20 flex justify-end gap-2 sm:bottom-4">
        <button type="submit" className="btn-primary px-6 py-3 text-base shadow-lg">
          💾 Speichern
        </button>
      </div>
    </form>
  )
}


const isEmpty = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Bester Treffer, sonst erste koreanische Serie, sonst irgendein Treffer */
const firstChoice = (list: PosterCandidate[], title: string, year?: number) => bestMatch(list, title, year) ?? list.find((c) => c.korean) ?? list[0]

/**
 * Sucht beim Tippen des Titels automatisch ein Poster (TVmaze + Wikipedia, ohne API-Schlüssel)
 * und ergänzt leere Angaben wie Jahr, Genres und Episoden.
 * Angaben, die nur aus einem früheren Treffer stammen, werden beim nächsten Treffer ersetzt –
 * was du selbst eingetragen oder geändert hast, bleibt.
 */
function useAutoPoster(d: Drama | null, setD: (d: Drama) => void) {
  const [cands, setCands] = useState<PosterCandidate[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'none'>('idle')
  const latest = useRef(d)
  latest.current = d
  /** Titel, für den zuletzt gesucht wurde (null = Formular noch nicht geladen) */
  const searchedFor = useRef<string | null>(null)
  /** Werte, die der letzte Treffer automatisch eingetragen hat */
  const filled = useRef<Partial<Record<keyof Drama, unknown>>>({})
  const req = useRef(0)
  const title = d?.title.trim() ?? ''
  const loaded = !!d

  const apply = async (c: PosterCandidate, n: number) => {
    let info: Partial<Drama>
    try {
      info = await completeCandidate(c)
    } catch {
      info = c.info
    }
    const cur = latest.current
    if (n !== req.current || !cur) return
    const next = { ...cur, posterUrl: c.posterUrl } as unknown as Record<string, unknown>
    const nextFilled: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(info), ...Object.keys(filled.current)])
    keys.delete('posterUrl')
    for (const k of keys) {
      const old = next[k]
      const prev = (filled.current as Record<string, unknown>)[k]
      const fromAuto = prev !== undefined && same(old, prev)
      if (!isEmpty(old) && !fromAuto) continue // selbst eingetragen → nicht anfassen
      const v = (info as Record<string, unknown>)[k]
      if (!isEmpty(v)) {
        next[k] = v
        nextFilled[k] = v
      } else if (fromAuto) {
        next[k] = Array.isArray(old) ? [] : undefined
      }
    }
    filled.current = nextFilled
    setD(next as unknown as Drama)
  }

  useEffect(() => {
    if (!loaded) return
    // Beim Bearbeiten: vorhandenes Poster bleibt, solange der Titel gleich bleibt
    if (searchedFor.current === null) searchedFor.current = latest.current?.posterUrl ? title : ''
    const n = ++req.current
    if (!title || title === searchedFor.current) {
      setStatus('idle')
      return
    }
    setStatus('searching')
    const t = setTimeout(async () => {
      try {
        const list = await searchFreePosters(title)
        if (n !== req.current) return
        searchedFor.current = title
        setCands(list)
        setStatus(list.length ? 'idle' : 'none')
        if (!list.length) return
        // ein automatisch eingetragenes Jahr nicht als Suchhilfe verwenden
        const year = latest.current?.year
        const yearIsAuto = filled.current.year !== undefined && same(year, filled.current.year)
        await apply(firstChoice(list, title, yearIsAuto ? undefined : year), n)
      } catch {
        if (n === req.current) setStatus('idle')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [title, loaded])

  /** Nächstes Poster aus der Trefferliste (lädt die Liste beim ersten Klick, falls noch nicht gesucht wurde) */
  const next = async () => {
    const n = ++req.current
    let list = cands
    if (!list.length) {
      setStatus('searching')
      try {
        list = await searchFreePosters(title)
      } catch {
        list = []
      }
      if (n !== req.current) return
      searchedFor.current = title
      setCands(list)
      setStatus(list.length ? 'idle' : 'none')
    }
    const cur = latest.current
    if (!list.length || !cur) return
    const i = list.findIndex((c) => c.posterUrl === cur.posterUrl)
    setD({ ...cur, posterUrl: list[(i + 1) % list.length].posterUrl })
  }

  const canCycle = !!title && status !== 'searching' && (cands.length > 1 || (cands.length === 0 && status === 'idle' && !!d?.posterUrl))
  return { status, canCycle, next }
}
