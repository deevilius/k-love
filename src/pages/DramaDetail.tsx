import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDrama, startRewatch, updateDrama, useDrama, useRatingCategories } from '../db/repo'
import { STATUS_LABELS, STATUS_ORDER, type Drama, type WatchStatus } from '../types'
import { cx, fmtRating, overall, today } from '../lib/util'
import { EpisodeStepper, Poster, RatingHearts, imageSrc } from '../components/ui'
import { confirmDialog } from '../components/Dialogs'
import OstSection from '../components/OstSection'

export default function DramaDetail() {
  const { id } = useParams()
  const d = useDrama(id)
  const nav = useNavigate()
  const categories = useRatingCategories()

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
    if (!(await confirmDialog(`„${d.title}“ wirklich löschen? Songs werden ebenfalls entfernt.`, { confirmLabel: 'Löschen', danger: true }))) return
    await deleteDrama(d.id)
    nav('/', { replace: true })
  }

  const rewatch = async () => {
    if (!(await confirmDialog(`„${d.title}“ noch einmal schauen? Der Fortschritt beginnt wieder bei Folge 0.`, { confirmLabel: '🔁 Nochmal schauen' }))) return
    await startRewatch(d)
  }

  const score = overall(d)
  // Kategorien, die es nicht mehr gibt, aber noch Noten haben (z. B. aus einer Sicherung), trotzdem zeigen
  const shownCats = [
    ...categories,
    ...Object.keys(d.ratings)
      .filter((k) => d.ratings[k] !== undefined && !categories.some((c) => c.key === k))
      .map((k) => ({ key: k, label: `${k} (entfernt)` })),
  ]

  return (
    <div className="space-y-5">
      <div className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-3xl">
        {d.backdropUrl && <img src={imageSrc(d.backdropUrl)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm" />}
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
              <button className="btn-outline" aria-pressed={d.favorite} onClick={() => update({ favorite: !d.favorite })}>
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
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                aria-pressed={d.status === s}
                onClick={() => setStatus(s)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-sm font-bold transition',
                  d.status === s ? 'bg-pink-600 text-white shadow' : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-white/10 dark:text-rose-100',
                )}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          {d.status === 'watching' && <EpisodeStepper drama={d} />}
          {d.status === 'completed' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {!!d.rewatchCount && (
                <span className="chip">
                  🔁 {d.rewatchCount}× erneut geschaut
                </span>
              )}
              <button className="btn-outline px-3 py-1 text-sm" onClick={rewatch}>
                🔁 Nochmal schauen
              </button>
            </div>
          )}
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="h-display text-lg font-bold">💗 Meine Bewertung</h2>
          {shownCats.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <span className="font-semibold">{c.label}</span>
              <RatingHearts label={c.label} value={d.ratings[c.key]} onChange={(v) => update({ ratings: { ...d.ratings, [c.key]: v } })} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 border-t border-rose-100 pt-3 dark:border-white/10">
            <span className="font-bold">Gesamt</span>
            <RatingHearts label="Gesamtnote" value={d.overallRating} onChange={(v) => update({ overallRating: v })} />
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
