import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDramas } from '../db/repo'
import { STATUS_LABELS, STATUS_ORDER, type Drama, type WatchStatus } from '../types'
import { cx, fmtRating, overall } from '../lib/util'
import { Empty, EpisodeStepper, Poster, Progress, ScoreBubble, StatusBadge } from '../components/ui'
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
      <section className="card relative flex items-center gap-2 overflow-hidden bg-gradient-to-br from-pink-100/80 via-white/70 to-purple-100/80 p-3 sm:gap-6 sm:p-5 dark:from-pink-900/30 dark:via-white/5 dark:to-purple-900/30">
        <CoupleArt className="w-40 shrink-0 sm:w-64" />
        <div className="min-w-0 space-y-1.5">
          <p className="h-display text-sm font-bold text-pink-600 dark:text-pink-300">안녕하세요!</p>
          <h1 className="h-display text-xl leading-tight font-bold sm:text-3xl">Willkommen in deiner K-Drama-Welt</h1>
          <p className="text-sm text-stone-600 dark:text-rose-100/70">
            {counts.all} Dramen · {counts.completed ?? 0} fertig geschaut
            {watching.length > 0 && ` · ${watching.length} gerade dran`}
          </p>
        </div>
      </section>

      {watching.length > 0 && status === 'all' && !q && (
        <section>
          <h2 className="h-display mb-2 text-lg font-bold">Schaue gerade 🍿</h2>
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

      <section className="card space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          <input
            ref={searchRef}
            id={LIBRARY_SEARCH_ID}
            type="search"
            aria-label="Bibliothek durchsuchen"
            className="input min-w-48 flex-1"
            placeholder="🔍 Titel, Schauspieler, Notizen … (Strg+F)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
          />
          <select aria-label="Sortierung" className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="flex rounded-full border border-rose-200 p-0.5 dark:border-white/15" role="group" aria-label="Ansicht">
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
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-bold transition',
                status === s ? 'bg-pink-600 text-white' : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-white/10 dark:text-rose-100',
              )}
            >
              {s === 'all' ? 'Alle' : STATUS_LABELS[s]} <span className="opacity-70">{counts[s] ?? 0}</span>
            </button>
          ))}
          <button
            aria-pressed={favOnly}
            onClick={() => setFavOnly(!favOnly)}
            className={cx('rounded-full px-3 py-1 text-xs font-bold', favOnly ? 'bg-pink-600 text-white' : 'bg-rose-100 text-rose-700 dark:bg-white/10 dark:text-rose-100')}
          >
            ⭐ Favoriten
          </button>
          {genres.length > 0 && (
            <select aria-label="Genre" className="input w-auto py-1 text-xs" value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Alle Genres</option>
              {genres.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          )}
          {platforms.length > 0 && (
            <select aria-label="Plattform" className="input w-auto py-1 text-xs" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">Alle Plattformen</option>
              {platforms.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
          {filtered && (
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setFilters(NO_FILTERS)}>
              ✕ Filter zurücksetzen
            </button>
          )}
        </div>
      </section>

      {list.length === 0 ? (
        <p className="py-10 text-center text-stone-500">Keine Treffer 🥲</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((d) => (
            <Link key={d.id} to={`/drama/${d.id}`} className="group">
              <div className="relative transition group-hover:-translate-y-1">
                <Poster drama={d} className="w-full shadow-md group-hover:shadow-xl" />
                <ScoreBubble drama={d} className="absolute top-2 right-2" />
                {d.favorite && <span className="absolute top-2 left-2 text-lg drop-shadow">⭐</span>}
                <StatusBadge status={d.status} className="absolute bottom-2 left-2 shadow" />
              </div>
              <div className="mt-2 px-0.5">
                <div className="line-clamp-2 leading-tight font-bold">{d.title}</div>
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
