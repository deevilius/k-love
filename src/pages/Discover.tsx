import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { emptyDrama, saveDrama, useDramas, useSettings } from '../db/repo'
import { buildTaste, loadCasts, loadSchedule, recommend } from '../lib/discover'
import { classicCandidate, loadClassics, loadShows, recommendClassics, type Classic } from '../lib/classics'
import { bestMatch, completeCandidate, norm, searchFreePosters, type PosterCandidate } from '../lib/freePosters'
import { ensureOst } from '../lib/autoOst'
import { cx } from '../lib/util'
import { Empty, Poster } from '../components/ui'

type Schedule = Awaited<ReturnType<typeof loadSchedule>>
type Shows = Awaited<ReturnType<typeof loadShows>>

const muted = 'text-sm text-stone-600 dark:text-rose-100/70'
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
const PAGE = 20

/** Was eine Karte anzeigt – für aktuelle und ältere Serien gleich */
interface CardData {
  candidate: PosterCandidate
  where?: string
  rating?: number
  upcomingOn?: string
  reason: string
}

export default function Discover() {
  const dramas = useDramas()
  const providers = useSettings().streamingProviders ?? []
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState(false)
  const [platform, setPlatform] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [showTv, setShowTv] = useState(false)

  const [classics, setClassics] = useState<Classic[] | null>(null)
  const [classicsError, setClassicsError] = useState(false)
  const [shows, setShows] = useState<Shows>({})
  const [casts, setCasts] = useState<Record<number, string[]>>({})
  const [classicCount, setClassicCount] = useState(PAGE)

  const load = useCallback(async (force = false) => {
    setError(false)
    setProgress({ done: 0, total: 0 })
    try {
      setSchedule(await loadSchedule({ force, onProgress: (done, total) => setProgress({ done, total }) }))
    } catch {
      setError(true)
    } finally {
      setProgress(null)
    }
  }, [])

  const loadOld = useCallback(async (force = false) => {
    setClassicsError(false)
    try {
      setClassics(await loadClassics(force))
    } catch {
      setClassicsError(true)
    }
  }, [])

  useEffect(() => {
    void load()
    void loadOld()
  }, [load, loadOld])

  const taste = useMemo(() => (dramas ? buildTaste(dramas) : null), [dramas])
  const recs = useMemo(() => (schedule && taste ? recommend(schedule, taste, casts) : []), [schedule, taste, casts])

  // Besetzung der aktuellen Serien nachladen – für „Mit <Schauspieler> aus …“
  const scheduleIds = useMemo(() => [...new Set((schedule ?? []).map((s) => s.show.id))].join(','), [schedule])
  useEffect(() => {
    if (!scheduleIds) return
    let alive = true
    void loadCasts(scheduleIds.split(',').map(Number)).then((c) => alive && setCasts(c))
    return () => {
      alive = false
    }
  }, [scheduleIds])

  const streaming = useMemo(
    () => recs.filter((r) => r.streaming && r.platform && (providers.length === 0 || providers.includes(r.platform))),
    [recs, providers],
  )
  const tv = useMemo(() => recs.filter((r) => !r.streaming), [recs])
  const platforms = useMemo(() => [...new Set(streaming.map((r) => r.platform!))].sort(), [streaming])
  const shown = platform ? streaming.filter((r) => r.platform === platform) : streaming

  useEffect(() => {
    if (platform && !platforms.includes(platform)) setPlatform('')
  }, [platform, platforms])

  // Ältere Serien: alles, was oben schon steht oder in der Bibliothek ist, fliegt raus
  const classicRecs = useMemo(() => {
    if (!classics || !taste) return []
    const above = new Set(recs.map((r) => r.candidate.tvmazeId!).filter(Boolean))
    return recommendClassics(classics, taste, providers, above).filter((r) => {
      const name = r.classic.tvmazeId ? shows[r.classic.tvmazeId]?.name : undefined
      return !name || !taste.owned.has(norm(name))
    })
  }, [classics, taste, recs, providers, shows])
  const visibleClassics = classicRecs.slice(0, classicCount)

  // Poster & Beschreibung nur für die sichtbaren älteren Serien nachladen
  const missingIds = visibleClassics.map((r) => r.classic.tvmazeId).filter((id): id is number => !!id && !(id in shows))
  const missingKey = missingIds.join(',')
  useEffect(() => {
    if (!missingKey) return
    let alive = true
    void loadShows(missingKey.split(',').map(Number)).then((s) => alive && setShows(s))
    return () => {
      alive = false
    }
  }, [missingKey])

  const addToWatchlist = async (c: PosterCandidate) => {
    setAdded((s) => new Set(s).add(c.key))
    let info = await completeCandidate(c)
    if (!info.posterUrl) {
      // Ältere Serie ohne TVmaze-Daten: Poster wie beim Eintragen suchen
      const hit = bestMatch(await searchFreePosters(c.title).catch(() => []), c.title, c.year)
      if (hit) info = { ...(await completeCandidate(hit)), ...info, posterUrl: hit.posterUrl }
    }
    const d = emptyDrama({ ...info, title: c.title, status: 'watchlist', platform: c.info.platform ?? info.platform })
    await saveDrama(d)
    void ensureOst(d).catch(() => {})
  }

  const loading = !!progress
  const currentCards: CardData[] = shown.map((r) => ({
    candidate: r.candidate,
    where: r.platform,
    rating: r.rating,
    upcomingOn: r.upcoming ? r.airdate : undefined,
    reason: r.reason,
  }))
  const tvCards: CardData[] = tv.map((r) => ({
    candidate: r.candidate,
    where: r.network,
    rating: r.rating,
    upcomingOn: r.upcoming ? r.airdate : undefined,
    reason: r.reason,
  }))
  const classicCards: CardData[] = visibleClassics.map((r) => {
    const show = r.classic.tvmazeId ? shows[r.classic.tvmazeId] : undefined
    return { candidate: classicCandidate(r.classic, show), where: r.platform, rating: show?.rating?.average ?? undefined, reason: r.reason }
  })

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-2xl font-bold">Entdecken ✨</h1>
          <p className={muted}>K-Dramen von Netflix, Viki & Co., die du noch nicht kennst – passend zu deinen Bewertungen, Lieblingsgenres und Schauspielern.</p>
        </div>
        <button
          className="btn-outline px-3 py-1 text-sm"
          onClick={() => {
            void load(true)
            void loadOld(true)
          }}
          disabled={loading}
        >
          🔄 Neu laden
        </button>
      </section>

      {providers.length === 0 && (
        <p className="card p-3 text-sm">
          📺 Tipp: Unter{' '}
          <Link to="/settings#streaming" className="font-bold text-pink-600 underline dark:text-pink-300">
            Einstellungen → Meine Streaming-Anbieter
          </Link>{' '}
          wählst du aus, welche Dienste du hast. Dann siehst du nur Serien, die du auch schauen kannst.
        </p>
      )}

      {/* ---------- Neu & aktuell ---------- */}
      <section className="space-y-3">
        <h2 className="h-display text-xl font-bold">🆕 Neu & aktuell</h2>
        {platforms.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {['', ...platforms].map((p) => (
              <button
                key={p || 'all'}
                onClick={() => setPlatform(p)}
                className={cx(
                  'rounded-full px-3 py-1 text-xs font-bold transition',
                  platform === p ? 'bg-pink-600 text-white' : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-white/10 dark:text-rose-100',
                )}
              >
                {p || 'Alle'} <span className="opacity-70">{p ? streaming.filter((r) => r.platform === p).length : streaming.length}</span>
              </button>
            ))}
          </div>
        )}

        {loading && !schedule ? (
          <div className="space-y-3">
            <p className={muted}>
              Lade Sendepläne{progress && progress.total > 0 ? ` … ${progress.done}/${progress.total}` : ' …'} (beim ersten Mal dauert das etwas)
            </p>
            <Skeleton />
          </div>
        ) : error && !schedule ? (
          <Empty icon="📡" title="Keine Verbindung">
            <p className={muted}>Die Empfehlungen brauchen Internet.</p>
            <button className="btn-primary mt-3" onClick={() => load()}>
              Erneut versuchen
            </button>
          </Empty>
        ) : shown.length === 0 ? (
          <p className={cx(muted, 'card p-4')}>
            {providers.length
              ? `Bei ${providers.join(', ')} ist in den letzten Wochen kein neues K-Drama gestartet, das du noch nicht hast.`
              : 'Im Moment gibt es keine neuen K-Dramen, die du noch nicht hast.'}
          </p>
        ) : (
          <Grid cards={currentCards} added={added} onAdd={addToWatchlist} />
        )}
      </section>

      {/* ---------- Ältere Serien ---------- */}
      <section className="space-y-3">
        <div>
          <h2 className="h-display text-xl font-bold">💎 Ältere Serien für dich</h2>
          <p className={muted}>Bekannte K-Dramen der letzten Jahre, die noch nicht in deiner Bibliothek sind. Den Anbieter kennt K-Love hier nur bei Netflix.</p>
        </div>
        {classicsError && !classics ? (
          <p className={cx(muted, 'card p-4')}>
            Konnte die Liste gerade nicht laden.{' '}
            <button className="font-bold text-pink-600 underline dark:text-pink-300" onClick={() => loadOld()}>
              Erneut versuchen
            </button>
          </p>
        ) : !classics ? (
          <div className="space-y-3">
            <p className={muted}>Lade ältere Serien … (beim ersten Mal ca. 20 Sekunden)</p>
            <Skeleton />
          </div>
        ) : classicCards.length === 0 ? (
          <p className={cx(muted, 'card p-4')}>Du kennst schon alle – Respekt! 🏆</p>
        ) : (
          <>
            <Grid cards={classicCards} added={added} onAdd={addToWatchlist} />
            {classicRecs.length > classicCount && (
              <div className="text-center">
                <button className="btn-outline" onClick={() => setClassicCount((n) => n + PAGE)}>
                  Mehr anzeigen
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------- Koreanisches TV ---------- */}
      {tv.length > 0 && (
        <section className="card p-4">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setShowTv(!showTv)} aria-expanded={showTv}>
            <span>
              <span className="h-display text-lg font-bold">📡 Gerade im koreanischen TV</span>
              <span className={cx(muted, 'block')}>
                {tv.length} Serien von koreanischen Sendern – laufen oft auch bei Netflix oder Viki, bitte selbst prüfen.
              </span>
            </span>
            <span className="text-xl">{showTv ? '▴' : '▾'}</span>
          </button>
          {showTv && (
            <div className="mt-4">
              <Grid cards={tvCards} added={added} onAdd={addToWatchlist} />
            </div>
          )}
        </section>
      )}

      <p className="text-center text-xs text-stone-400">Daten: TVmaze.com (CC BY-SA) · Wikidata (CC0)</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-rose-100 dark:bg-white/10" />
      ))}
    </div>
  )
}

function Grid({ cards, added, onAdd }: { cards: CardData[]; added: Set<string>; onAdd: (c: PosterCandidate) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.candidate.key} card={c} added={added.has(c.candidate.key)} onAdd={() => onAdd(c.candidate)} />
      ))}
    </div>
  )
}

function Card({ card, added, onAdd }: { card: CardData; added: boolean; onAdd: () => void }) {
  const [open, setOpen] = useState(false)
  const c = card.candidate
  return (
    <div className="flex flex-col">
      <button className="group relative text-left" onClick={() => setOpen(!open)} title="Beschreibung anzeigen">
        <Poster drama={{ title: c.title, posterUrl: c.posterUrl || undefined }} className="w-full shadow-md transition group-hover:-translate-y-1 group-hover:shadow-xl" />
        {card.where && <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">{card.where}</span>}
        {card.rating ? <span className="absolute top-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-stone-800">★ {card.rating.toFixed(1)}</span> : null}
        {card.upcomingOn && <span className="absolute bottom-2 left-2 rounded-full bg-purple-600 px-2 py-0.5 text-[11px] font-bold text-white">ab {fmtDate(card.upcomingOn)}</span>}
      </button>
      <div className="mt-2 flex flex-1 flex-col gap-1 px-0.5">
        <div className="line-clamp-2 leading-tight font-bold">{c.title}</div>
        <div className="text-xs text-stone-500 dark:text-rose-100/60">{[c.year, ...(c.info.genres ?? []).slice(0, 2)].filter(Boolean).join(' · ')}</div>
        <div className="text-xs font-semibold text-pink-700 dark:text-pink-300">{card.reason}</div>
        {open && <p className="text-xs text-stone-600 dark:text-rose-100/70">{c.info.overview ?? 'Keine Beschreibung vorhanden.'}</p>}
        <button className={cx('mt-auto px-3 py-1 text-xs', added ? 'btn-ghost' : 'btn-outline')} onClick={onAdd} disabled={added}>
          {added ? '✓ In der Merkliste' : '+ Merkliste'}
        </button>
      </div>
    </div>
  )
}
