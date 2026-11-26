import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { emptyDrama, saveDrama, useDrama, useDramas, useSettings } from '../db/repo'
import { PLATFORMS, RATING_KEYS, STATUS_LABELS, STATUS_ORDER, type Drama } from '../types'
import { IMG, searchTv, tvDetails, type TmdbSearchResult } from '../lib/tmdb'
import { completeCandidate, searchFreePosters, type PosterCandidate } from '../lib/freePosters'
import { avgRating, fmtRating, today } from '../lib/util'
import { Poster, RatingHearts, TagInput } from '../components/ui'

export default function DramaForm() {
  const { id } = useParams()
  const existing = useDrama(id)
  const all = useDramas()
  const settings = useSettings()
  const nav = useNavigate()
  const [d, setD] = useState<Drama | null>(id ? null : emptyDrama())
  const [error, setError] = useState('')

  useEffect(() => {
    if (id && existing && !d) setD(structuredClone(existing))
  }, [id, existing, d])

  if (id && existing === undefined && !d) return null
  if (!d) return <p>Drama nicht gefunden.</p>

  const set = <K extends keyof Drama>(k: K, v: Drama[K]) => setD({ ...d, [k]: v })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!d.title.trim()) return setError('Bitte einen Titel eingeben.')
    const dup = all?.find((x) => x.id !== d.id && x.title.trim().toLowerCase() === d.title.trim().toLowerCase())
    if (dup && !confirm(`„${dup.title}“ ist schon in deiner Liste. Trotzdem speichern?`)) return
    const next = { ...d, title: d.title.trim() }
    if (next.status === 'completed' && !next.finishedAt && existing?.status !== 'completed') next.finishedAt = today()
    if (next.status === 'watching' && !next.startedAt) next.startedAt = today()
    await saveDrama(next)
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

      {!settings.tmdbApiKey ? (
        <FreePosterSearch
          title={d.title}
          onPick={(info, title) =>
            setD((cur) => {
              if (!cur) return cur
              const next: Drama = { ...cur, posterUrl: info.posterUrl ?? cur.posterUrl, title: cur.title.trim() ? cur.title : title }
              // übrige Angaben nur ergänzen, nichts Eigenes überschreiben
              for (const [k, v] of Object.entries(info) as [keyof Drama, unknown][]) {
                const old = next[k]
                const empty = old === undefined || old === '' || (Array.isArray(old) && old.length === 0)
                if (empty && v !== undefined && !(Array.isArray(v) && v.length === 0)) (next as unknown as Record<string, unknown>)[k] = v
              }
              return next
            })
          }
        />
      ) : (
      <TmdbSearch
        apiKey={settings.tmdbApiKey}
        language={settings.tmdbLanguage}
        initialQuery={id ? d.title : ''}
        onPick={(info) =>
          setD((cur) =>
            cur
              ? {
                  ...cur,
                  ...Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))),
                  // eigene Angaben behalten, falls schon gesetzt
                  platform: cur.platform || info.platform,
                }
              : cur,
          )
        }
      />
      )}

      <div className="card grid gap-5 p-5 sm:grid-cols-[160px_1fr]">
        <div className="space-y-2">
          <Poster drama={d} className="w-full shadow-md" />
          <input className="input text-xs" placeholder="Poster-URL (optional)" value={d.posterUrl ?? ''} onChange={(e) => set('posterUrl', e.target.value || undefined)} />
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
          {RATING_KEYS.map((k) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="font-semibold">{settings.ratingLabels[k]}</span>
              <RatingHearts value={d.ratings[k]} onChange={(v) => set('ratings', { ...d.ratings, [k]: v })} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rose-100 pt-4 dark:border-white/10">
          <div>
            <span className="font-bold">Gesamtnote</span>
            <span className="ml-2 text-xs text-stone-500">leer = Durchschnitt ({fmtRating(avgRating(d))})</span>
          </div>
          <RatingHearts value={d.overallRating} onChange={(v) => set('overallRating', v)} size="lg" />
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

function TmdbSearch({
  apiKey,
  language,
  initialQuery,
  onPick,
}: {
  apiKey?: string
  language: string
  initialQuery: string
  onPick: (info: Awaited<ReturnType<typeof tvDetails>>) => void
}) {
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<TmdbSearchResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!apiKey)
    return (
      <div className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
        <span>💡 Mit einem kostenlosen TMDB-Schlüssel werden Cover, Besetzung & Episoden automatisch ausgefüllt.</span>
        <Link to="/settings" className="btn-outline">
          Einrichten
        </Link>
      </div>
    )

  const search = async () => {
    if (!q.trim()) return
    setBusy(true)
    setErr('')
    try {
      setResults(await searchTv(q, apiKey, language))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pick = async (r: TmdbSearchResult) => {
    setBusy(true)
    try {
      onPick(await tvDetails(r.id, apiKey, language))
      setResults(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="🔎 Auf TMDB suchen, z. B. „Crash Landing on You“"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
        />
        <button type="button" className="btn-primary" onClick={search} disabled={busy}>
          {busy ? '…' : 'Suchen'}
        </button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {results && (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {results.length === 0 && <p className="text-sm text-stone-500">Nichts gefunden.</p>}
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => pick(r)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-rose-50 dark:hover:bg-white/5"
            >
              {r.poster_path ? (
                <img src={IMG(r.poster_path, 'w92')} alt="" className="h-16 w-11 rounded object-cover" />
              ) : (
                <div className="h-16 w-11 rounded bg-rose-200 dark:bg-white/10" />
              )}
              <div className="min-w-0">
                <div className="font-bold">
                  {r.name} {r.first_air_date && <span className="font-normal text-stone-500">({r.first_air_date.slice(0, 4)})</span>}
                </div>
                {r.original_name !== r.name && <div className="text-xs text-stone-500">{r.original_name}</div>}
                <div className="line-clamp-1 text-xs text-stone-500">{r.overview}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Poster-Suche ohne API-Schlüssel (TVmaze + Wikipedia) */
function FreePosterSearch({ title, onPick }: { title: string; onPick: (info: Partial<Drama>, title: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PosterCandidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  const search = async (query = q || title) => {
    if (!query.trim()) return
    setQ(query)
    setBusy(true)
    try {
      setResults(await searchFreePosters(query.trim()))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (c: PosterCandidate) => {
    setPicked(c.key)
    onPick(await completeCandidate(c), c.title)
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex gap-2">
        <input
          className="input"
          placeholder={title ? `🖼️ Poster suchen für „${title}“` : '🖼️ Poster suchen, z. B. „Crash Landing on You“'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
        />
        <button type="button" className="btn-primary" onClick={() => search()} disabled={busy || !(q || title).trim()}>
          {busy ? '…' : 'Suchen'}
        </button>
      </div>
      <p className="text-xs text-stone-500 dark:text-rose-100/60">Tipp: Englische Titel finden am meisten. Klick auf ein Poster übernimmt es (plus Jahr, Genres, Episoden, wenn noch leer).</p>
      {results && results.length === 0 && <p className="text-sm text-stone-500">Kein Poster gefunden 🥲 – probier den englischen Titel oder füge unten eine Bild-URL ein.</p>}
      {results && results.length > 0 && (
        <div className="grid max-h-[26rem] grid-cols-3 gap-3 overflow-y-auto p-1 sm:grid-cols-5">
          {results.map((c) => (
            <button
              type="button"
              key={c.key}
              onClick={() => pick(c)}
              className={
                'group rounded-xl p-1 text-left transition hover:bg-rose-50 dark:hover:bg-white/5 ' +
                (picked === c.key ? 'ring-3 ring-pink-500' : '')
              }
            >
              <img src={c.posterUrl} alt={c.title} loading="lazy" className="aspect-[2/3] w-full rounded-lg object-cover shadow group-hover:shadow-md" />
              <div className="mt-1 line-clamp-2 text-xs leading-tight font-bold">{c.title}</div>
              <div className="text-[10px] text-stone-500 dark:text-rose-100/60">
                {[c.year, c.source, c.korean && '🇰🇷'].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
