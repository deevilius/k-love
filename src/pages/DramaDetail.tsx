import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDrama, updateDrama, useDrama } from '../db/repo'
import { DEFAULT_RATING_LABELS, RATING_KEYS, STATUS_LABELS, STATUS_ORDER, type Drama, type WatchStatus } from '../types'
import { fmtRating, overall, today } from '../lib/util'
import { Poster, RatingHearts } from '../components/ui'
import OstSection from '../components/OstSection'

export default function DramaDetail() {
  const { id } = useParams()
  const d = useDrama(id)
  const nav = useNavigate()

  if (d === undefined) return null
  if (!d)
    return (
      <p>
        Drama nicht gefunden. <Link to="/">Zurück</Link>
      </p>
    )

  const update = (changes: Partial<Drama>) => updateDrama(d.id, changes)

  const setStatus = (s: WatchStatus) => {
    const changes: Partial<Drama> = { status: s }
    if (s === 'watching' && !d.startedAt) changes.startedAt = today()
    if (s === 'completed') {
      if (!d.finishedAt) changes.finishedAt = today()
      if (d.episodes) changes.currentEpisode = d.episodes
    }
    void update(changes)
  }

  const remove = async () => {
    if (!confirm(`„${d.title}“ wirklich löschen? Songs werden ebenfalls entfernt.`)) return
    await deleteDrama(d.id)
    nav('/', { replace: true })
  }

  const score = overall(d)

  return (
    <div className="space-y-5">
      <div className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-3xl">
        {d.backdropUrl && <img src={d.backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm" />}
        <div className="relative grid gap-5 bg-gradient-to-b from-transparent to-rose-50/90 p-4 sm:grid-cols-[200px_1fr] sm:p-6 dark:to-[#1a1220]/90">
          <Poster drama={d} className="mx-auto w-44 shadow-xl sm:w-full" />
          <div className="space-y-3">
            <div>
              <h1 className="h-display text-3xl font-bold">{d.title}</h1>
              {d.originalTitle && <div className="text-lg text-stone-500 dark:text-rose-100/70">{d.originalTitle}</div>}
              <div className="mt-1 text-sm text-stone-600 dark:text-rose-100/80">
                {[d.year, d.platform, d.episodes && `${d.episodes} Episoden`, d.episodeRuntime && `ca. ${d.episodeRuntime} Min.`].filter(Boolean).join(' · ')}
              </div>
            </div>
            {d.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {d.genres.map((g) => (
                  <span key={g} className="chip">
                    {g}
                  </span>
                ))}
              </div>
            )}
            {score !== undefined && (
              <div className="flex items-center gap-3">
                <RatingHearts value={score} size="lg" />
                <span className="text-3xl font-extrabold text-pink-600 dark:text-pink-300">{fmtRating(score)}</span>
                <span className="text-sm text-stone-500">/ 10</span>
              </div>
            )}
            {d.overview && <p className="max-w-2xl text-sm leading-relaxed text-stone-700 dark:text-rose-50/80">{d.overview}</p>}
            {d.actors.length > 0 && (
              <p className="text-sm">
                <span className="font-bold">Mit: </span>
                {d.actors.join(', ')}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-outline" onClick={() => update({ favorite: !d.favorite })}>
                {d.favorite ? '⭐ Favorit' : '☆ Als Favorit'}
              </button>
              <Link to={`/drama/${d.id}/edit`} className="btn-outline">
                ✎ Bearbeiten
              </Link>
              <button className="btn-danger" onClick={remove}>
                🗑 Löschen
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="h-display text-lg font-bold">📺 Fortschritt</h2>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={
                  'rounded-full px-3 py-1.5 text-sm font-bold transition ' +
                  (d.status === s ? 'bg-pink-600 text-white shadow' : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-white/10 dark:text-rose-100')
                }
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="h-display text-lg font-bold">💗 Meine Bewertung</h2>
          {RATING_KEYS.map((k) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="font-semibold">{DEFAULT_RATING_LABELS[k]}</span>
              <RatingHearts value={d.ratings[k]} onChange={(v) => update({ ratings: { ...d.ratings, [k]: v } })} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 border-t border-rose-100 pt-3 dark:border-white/10">
            <span className="font-bold">Gesamt</span>
            <RatingHearts value={d.overallRating} onChange={(v) => update({ overallRating: v })} />
          </div>
          {d.overallRating === undefined && score !== undefined && (
            <p className="text-xs text-stone-500">Gesamt nicht gesetzt – angezeigt wird der Durchschnitt ({fmtRating(score)}).</p>
          )}
        </section>
      </div>

      <OstSection drama={d} />

      {(d.notes || d.tags.length > 0) && (
        <section className="card space-y-3 p-5">
          <h2 className="h-display text-lg font-bold">📝 Notizen</h2>
          {d.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                </span>
              ))}
            </div>
          )}
          {d.notes && <p className="whitespace-pre-wrap text-sm leading-relaxed">{d.notes}</p>}
        </section>
      )}
    </div>
  )
}
