import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDramas } from '../db/repo'
import { STATUS_LABELS, STATUS_ORDER, type Drama, type WatchStatus } from '../types'
import { cx, fmtRating, overall } from '../lib/util'
import { Empty, EpisodeStepper, Poster, Progress, ScoreBubble, StatusBadge, useDismiss } from '../components/ui'
import CoupleArt from '../components/CoupleArt'

type Sort = 'updated' | 'title' | 'rating' | 'year' | 'added'
type View = 'grid' | 'list'

const SORT_LABELS: Record<Sort, string> = {
  updated: 'Zuletzt bearbeitet',
  added: 'Zuletzt hinzugefügt',
  title: 'Titel A–Z',
  rating: 'Beste Bewertung',
  year: 'Neueste zuerst',
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

interface Filters {
  q: string
  status: WatchStatus | 'all'
  genre: string
  platform: string
  favOnly: boolean
}
const NO_FILTERS: Filters = { q: '', status: 'all', genre: '', platform: '', favOnly: false }
/** Filter überleben den Wechsel zur Drama-Seite und zurück (bis die App geschlossen wird) */
const FILTER_KEY = 'klove.filters'
function loadFilters(): Filters {
  try {
    return { ...NO_FILTERS, ...JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}') }
  } catch {
    return NO_FILTERS
  }
}

/** Id des Suchfelds – Strg+F springt hierher */
const LIBRARY_SEARCH_ID = 'library-search'

export default function Library() {
  const dramas = useDramas()
  const loc = useLocation()
  const searchRef = useRef<HTMLInputElement>(null)
  const [filters, setFilters] = useState<Filters>(loadFilters)
  const { q, status, genre, platform, favOnly } = filters
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const setQ = (v: string) => setFilter('q', v)
  const setStatus = (v: Filters['status']) => setFilter('status', v)
  const setGenre = (v: string) => setFilter('genre', v)
  const setPlatform = (v: string) => setFilter('platform', v)
  const setFavOnly = (v: boolean) => setFilter('favOnly', v)
  useEffect(() => sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters)), [filters])
  const filtered = q || status !== 'all' || genre || platform || favOnly

  // Strg+F von einer anderen Seite: nach dem Laden ins Suchfeld springen
  const focusSearch = (loc.state as { focusSearch?: number } | null)?.focusSearch
  useEffect(() => {
    if (focusSearch) searchRef.current?.focus()
  }, [focusSearch, dramas === undefined])
  const [sort, setSortState] = useState<Sort>(() => load('klove.sort', 'updated'))
  const [view, setViewState] = useState<View>(() => load('klove.view', 'grid'))
  const setSort = (s: Sort) => (setSortState(s), localStorage.setItem('klove.sort', JSON.stringify(s)))
  const setView = (v: View) => (setViewState(v), localStorage.setItem('klove.view', JSON.stringify(v)))

  const { genres, platforms, counts } = useMemo(() => {
    const g = new Set<string>()
    const p = new Set<string>()
    const c: Record<string, number> = { all: 0 }
    for (const d of dramas ?? []) {
      d.genres.forEach((x) => g.add(x))
      if (d.platform) p.add(d.platform)
      c.all++
      c[d.status] = (c[d.status] ?? 0) + 1
    }
    return { genres: [...g].sort(), platforms: [...p].sort(), counts: c }
  }, [dramas])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = (dramas ?? []).filter(
      (d) =>
        (status === 'all' || d.status === status) &&
        (!genre || d.genres.includes(genre)) &&
        (!platform || d.platform === platform) &&
        (!favOnly || d.favorite) &&
        (!needle ||
          [d.title, d.originalTitle, ...d.actors, ...d.tags, d.notes].some((s) => s?.toLowerCase().includes(needle))),
    )
    const cmp: Record<Sort, (a: Drama, b: Drama) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      added: (a, b) => b.createdAt.localeCompare(a.createdAt),
      title: (a, b) => a.title.localeCompare(b.title, 'de'),
      rating: (a, b) => (overall(b) ?? -1) - (overall(a) ?? -1),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    }
    return filtered.sort(cmp[sort])
  }, [dramas, q, status, genre, platform, favOnly, sort])

  if (dramas === undefined) return null

  if (dramas.length === 0)
    return (
      <Empty icon={<CoupleArt className="mx-auto w-full max-w-sm" />} title="Noch keine Dramen hier">
        <p>Füge dein erstes K-Drama hinzu.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/new" className="btn-primary">
            ➕ Drama hinzufügen
          </Link>
        </div>
      </Empty>
    )

  const watching = dramas.filter((d) => d.status === 'watching')

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-3">
        <CoupleArt className="hidden w-20 shrink-0 sm:block" />
        <div className="min-w-0">
          <h1 className="h-display text-xl leading-tight font-bold sm:text-2xl">
            <span className="text-pink-600 dark:text-pink-300">안녕하세요!</span> Deine K-Dramen
          </h1>
          <p className="text-sm text-stone-600 dark:text-rose-100/70">
            {counts.all} Dramen · {counts.completed ?? 0} fertig geschaut
            {watching.length > 0 && ` · ${watching.length} gerade dran`}
          </p>
        </div>
      </section>

      {watching.length > 0 && status === 'all' && !q && (
        <section>
          <h2 className="h-display mb-2 text-lg font-bold">
            Schaue gerade 🍿 <span className="text-sm font-semibold text-stone-500 dark:text-rose-100/60">{watching.length}</span>
          </h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {watching.map((d) => (
              <Link key={d.id} to={`/drama/${d.id}`} className="card flex w-72 shrink-0 snap-start gap-3 p-2.5 transition hover:-translate-y-0.5 hover:shadow-md">
                <Poster drama={d} className="w-16 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                  <div className="truncate font-bold">{d.title}</div>
                  <div className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-rose-100/60">
                    <span>
                      Episode {d.currentEpisode ?? 0}
                      {d.episodes ? ` / ${d.episodes}` : ''}
                    </span>
                    <EpisodeStepper drama={d} compact />
                  </div>
                  <Progress drama={d} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="sticky top-[3.75rem] z-20 -mx-4 space-y-2 border-b border-rose-100/70 bg-rose-50/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 dark:border-white/5 dark:bg-[#1a1220]/85">
        <div className="flex gap-2">
          <input
            ref={searchRef}
            id={LIBRARY_SEARCH_ID}
            type="search"
            aria-label="Bibliothek durchsuchen"
            className="input min-w-0 flex-1"
            placeholder="🔍 Titel, Schauspieler, Notizen … (Strg+F)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
          />
          <select aria-label="Sortierung" title="Sortierung" className="input hidden w-auto sm:block" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="flex shrink-0 rounded-full border border-rose-200 p-0.5 dark:border-white/15" role="group" aria-label="Ansicht">
            {(['grid', 'list'] as View[]).map((v) => (
              <button
                key={v}
                className={cx('rounded-full px-3 py-1 text-sm', view === v && 'bg-pink-600 text-white')}
                onClick={() => setView(v)}
                title={v === 'grid' ? 'Poster' : 'Liste'}
                aria-label={v === 'grid' ? 'Posteransicht' : 'Listenansicht'}
                aria-pressed={view === v}
              >
                {v === 'grid' ? '▦' : '☰'}
              </button>
            ))}
          </div>
          <MoreFilters
            sort={sort}
            setSort={setSort}
            favOnly={favOnly}
            setFavOnly={setFavOnly}
            genre={genre}
            setGenre={setGenre}
            genres={genres}
            platform={platform}
            setPlatform={setPlatform}
            platforms={platforms}
          />
        </div>
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
          {(['all', ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cx(
                'shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap transition',
                status === s ? 'bg-pink-600 text-white' : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-white/10 dark:text-rose-100',
              )}
            >
              {s === 'all' ? 'Alle' : STATUS_LABELS[s]} <span className="opacity-70">{counts[s] ?? 0}</span>
            </button>
          ))}
          {filtered && (
            <button className="btn-ghost ml-auto shrink-0 px-3 py-1 text-xs whitespace-nowrap" onClick={() => setFilters(NO_FILTERS)}>
              ✕ Zurücksetzen
            </button>
          )}
        </div>
      </section>

      {filtered && list.length > 0 && (
        <p className="text-sm text-stone-500 dark:text-rose-100/60">
          {list.length} von {counts.all} Dramen
        </p>
      )}

      {list.length === 0 ? (
        <p className="py-10 text-center text-stone-500">Keine Treffer 🥲</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {list.map((d) => (
            <Link key={d.id} to={`/drama/${d.id}`} className="group">
              <div className="relative transition group-hover:-translate-y-1">
                <Poster drama={d} className="w-full shadow-md group-hover:shadow-xl" />
                <ScoreBubble drama={d} className="absolute top-2 right-2" />
                {d.favorite && <span className="absolute top-2 left-2 text-lg drop-shadow">⭐</span>}
                <StatusBadge status={d.status} className="absolute bottom-2 left-2 shadow" />
              </div>
              <div className="mt-2 px-0.5">
                <div className="truncate leading-tight font-bold" title={d.title}>
                  {d.title}
                </div>
                <div className="text-xs text-stone-500 dark:text-rose-100/60">{[d.year, d.platform].filter(Boolean).join(' · ')}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-rose-100 overflow-hidden dark:divide-white/5">
          {list.map((d) => (
            <Link key={d.id} to={`/drama/${d.id}`} className="flex items-center gap-3 p-2.5 hover:bg-rose-50 dark:hover:bg-white/5">
              <Poster drama={d} className="w-11 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">
                  {d.favorite && '⭐ '}
                  {d.title}
                </div>
                <div className="truncate text-xs text-stone-500 dark:text-rose-100/60">
                  {[d.year, d.platform, d.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <StatusBadge status={d.status} className="hidden sm:inline-flex" />
              <span className="w-12 text-right font-extrabold text-pink-600 tabular-nums dark:text-pink-300">{fmtRating(overall(d))}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** „Filter“-Knopf mit Popover für seltener gebrauchte Filter (und Sortierung auf schmalen Bildschirmen) */
function MoreFilters(p: {
  sort: Sort
  setSort: (s: Sort) => void
  favOnly: boolean
  setFavOnly: (v: boolean) => void
  genre: string
  setGenre: (v: string) => void
  genres: string[]
  platform: string
  setPlatform: (v: string) => void
  platforms: string[]
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(box, open, () => setOpen(false))
  const active = [p.favOnly, p.genre, p.platform].filter(Boolean).length

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx('btn h-full border px-3', active ? 'border-pink-600 bg-pink-600 text-white' : 'border-rose-200 text-stone-600 hover:bg-rose-100 dark:border-white/15 dark:text-rose-100 dark:hover:bg-white/10')}
      >
        <span aria-hidden>🎛️</span>
        <span className="hidden sm:inline">Filter</span>
        {active > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs text-pink-700">{active}</span>}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-64 space-y-3 rounded-xl border border-rose-100 bg-white p-3 text-sm shadow-xl dark:border-white/10 dark:bg-[#251a2c]">
          <label className="block space-y-1 sm:hidden">
            <span className="text-xs font-bold text-stone-500 dark:text-rose-100/60">Sortierung</span>
            <select className="input" value={p.sort} onChange={(e) => p.setSort(e.target.value as Sort)}>
              {Object.entries(SORT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-pink-600" checked={p.favOnly} onChange={(e) => p.setFavOnly(e.target.checked)} />
            ⭐ Nur Favoriten
          </label>
          {p.genres.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs font-bold text-stone-500 dark:text-rose-100/60">Genre</span>
              <select className="input" value={p.genre} onChange={(e) => p.setGenre(e.target.value)}>
                <option value="">Alle Genres</option>
                {p.genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
          )}
          {p.platforms.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs font-bold text-stone-500 dark:text-rose-100/60">Plattform</span>
              <select className="input" value={p.platform} onChange={(e) => p.setPlatform(e.target.value)}>
                <option value="">Alle Plattformen</option>
                {p.platforms.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}
          {active > 0 && (
            <button
              type="button"
              className="btn-ghost w-full py-1 text-xs"
              onClick={() => (p.setFavOnly(false), p.setGenre(''), p.setPlatform(''))}
            >
              ✕ Diese Filter zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  )
}
