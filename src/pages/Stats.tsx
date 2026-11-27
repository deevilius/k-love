import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAllSongs, useDramas, useRatingCategories } from '../db/repo'
import { STATUS_LABELS, STATUS_ORDER } from '../types'
import { fmtRating, overall } from '../lib/util'
import { episodesPerMonth, watchedEpisodes } from '../lib/stats'
import { Empty, Poster } from '../components/ui'

const BAR = '#db2777' // pink-600: eine Farbe für alle Einzelreihen
/** Angenommene Episodenlänge, wenn keine bekannt ist */
const DEFAULT_RUNTIME = 60

function count(list: string[]) {
  const m = new Map<string, number>()
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export default function Stats() {
  const dramas = useDramas()
  const songs = useAllSongs()
  const categories = useRatingCategories()

  const s = useMemo(() => {
    const list = dramas ?? []
    const eps = list.reduce((a, d) => a + watchedEpisodes(d), 0)
    const minutes = list.reduce((a, d) => a + watchedEpisodes(d) * (d.episodeRuntime ?? DEFAULT_RUNTIME), 0)
    // Dramen mit gesehenen Folgen, aber ohne bekannte Episodenlänge → Stunden sind geschätzt
    const guessed = list.filter((d) => !d.episodeRuntime && watchedEpisodes(d) > 0).length
    const rewatches = list.reduce((a, d) => a + (d.rewatchCount ?? 0), 0)
    const perMonth = episodesPerMonth(list)
    const hasLog = perMonth.some((m) => m.value > 0)
    const rated = list.filter((d) => overall(d) !== undefined)
    const avg = rated.length ? rated.reduce((a, d) => a + overall(d)!, 0) / rated.length : undefined
    const byStatus = STATUS_ORDER.map((st) => ({ name: STATUS_LABELS[st], value: list.filter((d) => d.status === st).length }))
    const genres = count(list.flatMap((d) => d.genres)).slice(0, 8)
    const actors = count(list.flatMap((d) => d.actors)).filter((a) => a.value > 1).slice(0, 10)
    const platforms = count(list.map((d) => d.platform).filter((x): x is string => !!x))
    const top = [...rated].sort((a, b) => overall(b)! - overall(a)!).slice(0, 10)
    const perYear = count(list.filter((d) => d.finishedAt).map((d) => d.finishedAt!.slice(0, 4))).sort((a, b) => a.name.localeCompare(b.name))
    const cats = categories
      .map(({ key, label }) => {
        const v = list.map((d) => d.ratings[key]).filter((x): x is number => x !== undefined)
        return { name: label, value: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0, n: v.length }
      })
      .filter((c) => c.n > 0)
    return {
      eps,
      minutes,
      guessed,
      rewatches,
      perMonth,
      hasLog,
      avg,
      byStatus,
      genres,
      actors,
      platforms,
      top,
      perYear,
      cats,
      completed: list.filter((d) => d.status === 'completed').length,
    }
  }, [dramas, categories])

  if (!dramas) return null
  if (!dramas.length)
    return (
      <Empty icon="📊" title="Noch keine Statistik">
        Sobald du Dramen hinzufügst, siehst du hier deine Lieblingsgenres, Top-Liste und mehr.
      </Empty>
    )

  const hours = Math.round(s.minutes / 60)

  return (
    <div className="space-y-5">
      <h1 className="h-display text-2xl font-bold">Meine K-Drama-Statistik</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Dramen insgesamt" value={dramas.length} />
        <Tile label="Fertig geschaut" value={s.completed} sub={s.rewatches ? `dazu ${s.rewatches}× erneut geschaut` : undefined} />
        <Tile
          label="Episoden gesehen"
          value={s.eps}
          sub={`≈ ${hours} Stunden (${(hours / 24).toFixed(1)} Tage)${s.guessed ? ' · geschätzt' : ''}`}
          title={s.guessed ? `Bei ${s.guessed} Dramen ist die Episodenlänge unbekannt – dort sind ${DEFAULT_RUNTIME} Minuten angenommen.` : undefined}
        />
        <Tile label="Ø Bewertung" value={fmtRating(s.avg && Math.round(s.avg * 10) / 10)} sub={`${songs?.length ?? 0} OST-Songs gespeichert`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Nach Status" data={s.byStatus} />
        {s.genres.length > 0 && <ChartCard title="Lieblingsgenres" data={s.genres} />}
        {s.cats.length > 0 && <ChartCard title="Ø Note pro Kategorie" data={s.cats} max={10} unit=" / 10" />}
        {s.platforms.length > 0 && <ChartCard title="Plattformen" data={s.platforms} />}
        {s.perYear.length > 0 && <ColumnCard title="Fertig geschaut pro Jahr" data={s.perYear} />}
        {s.hasLog && <ColumnCard title="Episoden pro Monat" data={s.perMonth} unit="Episoden" note="Gezählt werden Folgen, die du mit „+1“ abgehakt hast." />}

        {s.actors.length > 0 && (
          <section className="card p-5">
            <h2 className="h-display mb-3 text-lg font-bold">Häufigste Schauspieler</h2>
            <ol className="space-y-1.5">
              {s.actors.map((a, i) => (
                <li key={a.name} className="flex items-center gap-3">
                  <span className="w-5 text-right text-sm font-bold text-stone-400">{i + 1}.</span>
                  <span className="flex-1 font-semibold">{a.name}</span>
                  <span className="text-sm text-stone-500 dark:text-rose-100/70">{a.value} Dramen</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {s.top.length > 0 && (
        <section className="card p-5">
          <h2 className="h-display mb-3 text-lg font-bold">🏆 Meine Top 10</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {s.top.map((d, i) => (
              <Link key={d.id} to={`/drama/${d.id}`} className="group relative">
                <Poster drama={d} className="w-full shadow transition group-hover:-translate-y-1" />
                <span className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-extrabold text-pink-700 shadow">{i + 1}</span>
                <div className="mt-1.5 line-clamp-1 text-sm font-bold">{d.title}</div>
                <div className="text-xs text-stone-500 dark:text-rose-100/70">♥ {fmtRating(overall(d))}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, sub, title }: { label: string; value: number | string; sub?: string; title?: string }) {
  return (
    <div className="card p-4" title={title}>
      <div className="text-xs font-bold tracking-wide text-stone-500 uppercase dark:text-rose-100/60">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500 dark:text-rose-100/60">{sub}</div>}
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #fbcfe8', background: 'white', color: '#292524', fontSize: 13 },
  cursor: { fill: 'rgba(219,39,119,0.08)' },
}

/** Horizontales Balkendiagramm – eine Reihe, eine Farbe, Werte als Text */
function ChartCard({ title, data, max, unit = '' }: { title: string; data: { name: string; value: number }[]; max?: number; unit?: string }) {
  const h = Math.max(120, data.length * 34 + 20)
  return (
    <section className="card p-5">
      <h2 className="h-display mb-3 text-lg font-bold">{title}</h2>
      <div style={{ height: h }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 36, top: 0, bottom: 0 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="currentColor" strokeOpacity={0.08} />
            <XAxis type="number" hide domain={[0, max ?? 'dataMax']} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 13 }} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit}`, '']} separator="" />
            <Bar dataKey="value" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', fill: 'currentColor', fontSize: 12, fontWeight: 700 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function ColumnCard({ title, data, unit = 'Dramen', note }: { title: string; data: { name: string; value: number }[]; unit?: string; note?: string }) {
  return (
    <section className="card p-5">
      <h2 className="h-display mb-3 text-lg font-bold">{title}</h2>
      {note && <p className="-mt-2 mb-2 text-xs text-stone-500 dark:text-rose-100/60">{note}</p>}
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: -20, right: 8, top: 16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} ${unit}`, '']} separator="" />
            <Bar dataKey="value" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={40} label={{ position: 'top', fill: 'currentColor', fontSize: 12, fontWeight: 700 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
