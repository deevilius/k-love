import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { allDramas, allSongs, newId, removeRatingCategory, saveRatingCategories, saveSettings, updateDrama, useRatingCategories, useSettings } from '../db/repo'
import { alertDialog, confirmDialog, toast } from '../components/Dialogs'
import { DEFAULT_RATING_CATEGORIES, MAX_RATING_CATEGORIES } from '../types'
import { canFindOst, ensureOst } from '../lib/autoOst'
import { bestMatch, completeCandidate, searchFreePosters } from '../lib/freePosters'
import { BackupSection } from '../components/BackupSection'
import { openFeedback } from '../lib/diagnostics'
import { showUpdateDialog, useUpdateState } from '../components/UpdateDialog'
import { playIntro, setIntroEnabled, stopIntro, useIntroEnabled, useIntroPlaying } from '../lib/lofi'
import { cx } from '../lib/util'
import { STREAMING_PROVIDERS } from '../types'

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
      <StreamingSection />
      <RatingSection />
      <PosterSection />
      <OstSection />
      <MusicSection />
      <ShortcutSection />
      <AppSection />
    </div>
  )
}

/** Eigene Bewertungskategorien: umbenennen, hinzufügen, entfernen */
function RatingSection() {
  const cats = useRatingCategories()
  const [label, setLabel] = useState('')
  const isDefault = cats === DEFAULT_RATING_CATEGORIES

  const rename = (key: string, value: string) => {
    const v = value.trim()
    if (!v || cats.find((c) => c.key === key)?.label === v) return
    void saveRatingCategories(cats.map((c) => (c.key === key ? { ...c, label: v } : c)))
  }
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const v = label.trim()
    if (!v || cats.length >= MAX_RATING_CATEGORIES) return
    void saveRatingCategories([...cats, { key: `c_${newId().slice(0, 8)}`, label: v }])
    setLabel('')
  }
  const remove = async (key: string, name: string) => {
    if (cats.length <= 1) return void alertDialog('Mindestens eine Kategorie muss bleiben.')
    if (!(await confirmDialog(`Kategorie „${name}“ entfernen? Die Noten dieser Kategorie werden bei allen Dramen gelöscht.`, { confirmLabel: 'Entfernen', danger: true }))) return
    await removeRatingCategory(key)
    toast(`„${name}“ entfernt.`)
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= cats.length) return
    const next = [...cats]
    ;[next[i], next[j]] = [next[j], next[i]]
    void saveRatingCategories(next)
  }

  return (
    <section className="card space-y-3 p-5" id="ratings">
      <h2 className="h-display text-lg font-bold">💗 Bewertungskategorien</h2>
      <p className={muted}>Wonach du Dramen bewertest. Die Gesamtnote ist – wenn du sie nicht selbst setzt – der Durchschnitt dieser Kategorien.</p>
      <ul className="space-y-1.5">
        {cats.map((c, i) => (
          <li key={c.key} className="flex items-center gap-1.5">
            <input
              className="input flex-1 py-1.5"
              defaultValue={c.label}
              aria-label={`Kategorie ${i + 1} umbenennen`}
              maxLength={30}
              onBlur={(e) => rename(c.key, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
            />
            <button className="btn-ghost px-2 py-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${c.label} nach oben`} title="Nach oben">
              ↑
            </button>
            <button className="btn-ghost px-2 py-1" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label={`${c.label} nach unten`} title="Nach unten">
              ↓
            </button>
            <button className="btn-danger px-2 py-1" onClick={() => remove(c.key, c.label)} aria-label={`${c.label} entfernen`} title="Entfernen">
              🗑
            </button>
          </li>
        ))}
      </ul>
      {cats.length < MAX_RATING_CATEGORIES ? (
        <form onSubmit={add} className="flex gap-2">
          <input className="input flex-1" value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} placeholder="Neue Kategorie, z. B. Second Lead, Kostüme …" />
          <button className="btn-outline" type="submit" disabled={!label.trim()}>
            ➕ Hinzufügen
          </button>
        </form>
      ) : (
        <p className="text-xs text-stone-500">Höchstens {MAX_RATING_CATEGORIES} Kategorien.</p>
      )}
      {!isDefault && (
        <button
          className="btn-ghost px-3 py-1 text-xs"
          onClick={async () => {
            if (await confirmDialog('Die fünf Standard-Kategorien wiederherstellen? Noten eigener Kategorien bleiben gespeichert, zählen aber erst wieder, wenn du die Kategorie neu anlegst.', { confirmLabel: 'Zurücksetzen' }))
              void saveSettings({ ratingCategories: undefined })
          }}
        >
          Standard wiederherstellen
        </button>
      )}
    </section>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Strg + F', 'In der Bibliothek suchen'],
  ['Strg + N', 'Neues Drama hinzufügen'],
  ['Alt + 1 … 7', 'Bibliothek, Entdecken, Hinzufügen, Musik, Koreanisch, Statistik, Einstellungen'],
  ['Leertaste', 'Musik im Mini-Player anhalten / weiterspielen'],
  ['← / →', 'Herz-Bewertung ändern (wenn ausgewählt), Entf = keine Note'],
  ['Esc', 'Dialog schließen, Suche leeren'],
]

function ShortcutSection() {
  return (
    <section className="card space-y-3 p-5" id="shortcuts">
      <h2 className="h-display text-lg font-bold">⌨️ Tastenkürzel</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded-md border border-rose-200 bg-white px-1.5 py-0.5 text-xs font-bold dark:border-white/15 dark:bg-white/5">{k}</kbd>
            </dt>
            <dd className="text-stone-600 dark:text-rose-100/70">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
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
      <div className="flex flex-wrap items-center gap-3 border-t border-rose-100 pt-3 dark:border-white/10">
        <p className="flex-1 text-sm text-stone-600 dark:text-rose-100/70">Du testest eine Beta – wir freuen uns über jede Rückmeldung! (GitHub-Konto nötig)</p>
        <button className="btn-outline px-3 py-1 text-sm" onClick={() => openFeedback('feedback')}>
          💬 Feedback senden
        </button>
        <button className="btn-ghost px-3 py-1 text-sm" onClick={() => openFeedback('bug')}>
          🐞 Fehler melden
        </button>
      </div>
    </section>
  )
}

/** Welche Streaming-Dienste man hat – Grundlage für Entdecken */
function StreamingSection() {
  const chosen = useSettings().streamingProviders ?? []
  const toggle = (p: string) =>
    void saveSettings({ streamingProviders: chosen.includes(p) ? chosen.filter((x) => x !== p) : [...chosen, p] })
  return (
    <section className="card space-y-3 p-5" id="streaming">
      <h2 className="h-display text-lg font-bold">📺 Meine Streaming-Anbieter</h2>
      <p className={muted}>
        Entdecken empfiehlt nur Serien, die bei diesen Anbietern laufen. Nichts ausgewählt = alle Anbieter.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {STREAMING_PROVIDERS.map((p) => {
          const on = chosen.includes(p)
          return (
            <button
              key={p}
              aria-pressed={on}
              onClick={() => toggle(p)}
              className={cx(
                'rounded-full px-3 py-1 text-sm font-bold transition',
                on ? 'bg-pink-600 text-white' : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-white/10 dark:text-rose-100',
              )}
            >
              {on ? '✓ ' : ''}
              {p}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MusicSection() {
  const on = useIntroEnabled()
  const playing = useIntroPlaying()
  return (
    <section className="card space-y-3 p-5">
      <h2 className="h-display text-lg font-bold">🎵 Startmusik</h2>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-pink-600"
          checked={on}
          onChange={(e) => setIntroEnabled(e.target.checked)}
        />
        Beim Start einen kurzen Lofi-Song spielen
      </label>
      <button className="btn-outline px-3 py-1 text-sm" onClick={() => (playing ? stopIntro() : playIntro())}>
        {playing ? '⏹ Stoppen' : '▶ Probehören'}
      </button>
    </section>
  )
}

function PosterSection() {
  const [fill, setFill] = useState<{ done: number; total: number } | null>(null)

  const fillMissing = async () => {
    const all = await allDramas()
    const missing = all.filter((d) => !d.posterUrl)
    if (!missing.length) return toast('Alle Dramen haben bereits ein Poster. 🎉')
    if (
      !(await confirmDialog(`${missing.length} Dramen ohne Poster gefunden. Jetzt automatisch suchen?\n\nDer beste Treffer wird übernommen, deine Bewertungen und Angaben bleiben unverändert.`, {
        confirmLabel: 'Poster suchen',
      }))
    )
      return
    const notFound: string[] = []
    setFill({ done: 0, total: missing.length })
    for (const [i, d] of missing.entries()) {
      try {
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
      } catch {
        notFound.push(d.title)
      }
      setFill({ done: i + 1, total: missing.length })
    }
    setFill(null)
    if (notFound.length)
      void alertDialog('Diese kannst du über „Bearbeiten“ selbst auswählen.', { title: `Kein sicherer Treffer für ${notFound.length} Dramen`, list: notFound })
    else toast('Fertig! Alle Poster geladen 🎉')
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

function OstSection() {
  const settings = useSettings()
  const [fill, setFill] = useState<{ done: number; total: number } | null>(null)
  const [adblock, setAdblock] = useState<boolean | null>(null)
  useEffect(() => {
    window.klove?.adblock?.get().then(setAdblock)
  }, [])
  if (!canFindOst()) return null

  const fillMissing = async () => {
    const [dramas, songs] = await Promise.all([allDramas(), allSongs()])
    const withSongs = new Set(songs.map((s) => s.dramaId))
    const missing = dramas.filter((d) => !withSongs.has(d.id))
    if (!missing.length) return toast('Alle Dramen haben bereits Songs. 🎉')
    if (
      !(await confirmDialog(`${missing.length} Dramen ohne Songs gefunden. Jetzt auf YouTube nach einer OST suchen?\n\nEs wird jeweils eine OST-Playlist hinterlegt, sonst ein OST-Video.`, {
        confirmLabel: 'OSTs suchen',
      }))
    )
      return
    const notFound: string[] = []
    setFill({ done: 0, total: missing.length })
    for (const [i, d] of missing.entries()) {
      try {
        if (!(await ensureOst(d, { force: true }))) notFound.push(d.title)
      } catch {
        notFound.push(d.title)
      }
      setFill({ done: i + 1, total: missing.length })
      await new Promise((r) => setTimeout(r, 400)) // freundlich zu YouTube
    }
    setFill(null)
    if (notFound.length)
      void alertDialog('Diese kannst du auf der Drama-Seite unter „➕ Song“ selbst eintragen.', { title: `Keine OST gefunden für ${notFound.length} Dramen`, list: notFound })
    else toast('Fertig! Alle OSTs hinterlegt 🎉')
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="h-display text-lg font-bold">🎶 OST & YouTube</h2>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-pink-600"
          checked={settings.autoOst !== false}
          onChange={(e) => saveSettings({ autoOst: e.target.checked })}
        />
        Beim Speichern automatisch eine OST hinterlegen (wenn das Drama noch keine Songs hat)
      </label>
      {adblock !== null && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-pink-600"
            checked={adblock}
            onChange={async (e) => setAdblock(await window.klove!.adblock.set(e.target.checked))}
          />
          Werbung in YouTube-Videos blockieren
        </label>
      )}
      <p className={muted}>Sucht für alle Dramen ohne Songs eine OST-Playlist auf YouTube.</p>
      <button className="btn-primary" onClick={fillMissing} disabled={!!fill}>
        {fill ? `Suche … ${fill.done}/${fill.total}` : '🎶 Fehlende OSTs laden'}
      </button>
    </section>
  )
}
