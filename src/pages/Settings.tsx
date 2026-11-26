import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { allDramas, updateDrama, useSettings } from '../db/repo'
import { searchTv, tvDetails } from '../lib/tmdb'
import { bestMatch, completeCandidate, searchFreePosters } from '../lib/freePosters'
import { BackupSection } from '../components/BackupSection'
import { showUpdateDialog, useUpdateState } from '../components/UpdateDialog'

const muted = 'text-sm text-stone-600 dark:text-rose-100/70'

export default function SettingsPage() {
  const loc = useLocation()

  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [loc.hash])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="h-display text-2xl font-bold">Einstellungen</h1>
      <BackupSection />
      <PosterSection />
      <AppSection />
    </div>
  )
}

/** Version + Updates */
function AppSection() {
  const [version, setVersion] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const update = useUpdateState()
  useEffect(() => {
    window.klove?.getVersion().then(setVersion)
  }, [])
  if (!window.klove) return null

  const check = async () => {
    setBusy(true)
    setMsg('Suche nach Updates …')
    const r = await window.klove!.checkForUpdates()
    setBusy(false)
    if (r.status === 'available') {
      setMsg('')
      showUpdateDialog()
      return
    }
    setMsg(
      r.status === 'current'
        ? '💕 K-Love ist auf dem neuesten Stand.'
        : r.status === 'dev'
          ? 'Updates gibt es nur in der installierten App.'
          : `⚠️ Update-Prüfung fehlgeschlagen: ${r.message ?? ''}`,
    )
  }

  const hasUpdate = update.status !== 'idle' && !!update.version

  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="h-display flex-1 text-lg font-bold">ℹ️ K-Love {version}</h2>
        {hasUpdate ? (
          <button className="btn-primary px-3 py-1 text-sm" onClick={showUpdateDialog}>
            ✨ Version {update.version} installieren
          </button>
        ) : (
          <button className="btn-outline px-3 py-1 text-sm" onClick={check} disabled={busy}>
            🔄 Nach Updates suchen
          </button>
        )}
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </section>
  )
}

function PosterSection() {
  const settings = useSettings()
  const [fill, setFill] = useState<{ done: number; total: number } | null>(null)

  const fillMissing = async () => {
    const k = settings.tmdbApiKey
    const all = await allDramas()
    const missing = k ? all.filter((d) => !d.tmdbId) : all.filter((d) => !d.posterUrl)
    if (!missing.length) return alert('Alle Dramen haben bereits ein Poster. 🎉')
    if (!confirm(`${missing.length} Dramen ohne Poster gefunden. Jetzt automatisch suchen?\n\nDer beste Treffer wird übernommen, deine Bewertungen und Angaben bleiben unverändert.`)) return
    const notFound: string[] = []
    setFill({ done: 0, total: missing.length })
    for (const [i, d] of missing.entries()) {
      try {
        if (k) {
          const res = await searchTv(d.title, k, settings.tmdbLanguage)
          const best = (d.year && res.find((r) => r.first_air_date?.startsWith(String(d.year)))) || res[0]
          if (!best) throw new Error('nicht gefunden')
          const info = await tvDetails(best.id, k, settings.tmdbLanguage)
          await updateDrama(d.id, {
            tmdbId: info.tmdbId,
            posterUrl: d.posterUrl || info.posterUrl,
            backdropUrl: info.backdropUrl,
            overview: d.overview || info.overview,
            originalTitle: d.originalTitle || info.originalTitle,
            year: d.year ?? info.year,
            episodes: d.episodes ?? info.episodes,
            episodeRuntime: info.episodeRuntime,
            genres: d.genres.length ? d.genres : info.genres,
            actors: d.actors.length ? d.actors : info.actors,
            platform: d.platform || info.platform,
          })
        } else {
          const best = bestMatch(await searchFreePosters(d.title), d.title, d.year)
          if (!best) throw new Error('nicht gefunden')
          const info = await completeCandidate(best)
          await updateDrama(d.id, {
            posterUrl: info.posterUrl,
            overview: d.overview || info.overview,
            year: d.year ?? info.year,
            episodes: d.episodes ?? info.episodes,
            episodeRuntime: d.episodeRuntime ?? info.episodeRuntime,
            genres: d.genres.length ? d.genres : (info.genres ?? []),
            platform: d.platform || info.platform,
          })
          await new Promise((r) => setTimeout(r, 400)) // freundlich zu den freien Diensten
        }
      } catch {
        notFound.push(d.title)
      }
      setFill({ done: i + 1, total: missing.length })
    }
    setFill(null)
    alert(
      notFound.length
        ? `Fertig! Kein sicherer Treffer für:\n• ${notFound.join('\n• ')}\n\nDiese kannst du über „Bearbeiten“ → Poster suchen selbst auswählen.`
        : 'Fertig! Alle Poster geladen 🎉',
    )
  }

  return (
    <section className="card space-y-3 p-5" id="tmdb">
      <h2 className="h-display text-lg font-bold">🖼️ Poster</h2>
      <p className={muted}>Sucht für alle Dramen ohne Bild automatisch ein Poster und ergänzt fehlende Infos.</p>
      <button className="btn-primary" onClick={fillMissing} disabled={!!fill}>
        {fill ? `Suche … ${fill.done}/${fill.total}` : '🖼️ Fehlende Poster laden'}
      </button>
    </section>
  )
}
