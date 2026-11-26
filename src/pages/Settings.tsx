import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  allDramas,
  allSongs,
  bulkAddDramas,
  saveSettings,
  updateDrama,
  useDramas,
  useSettings,
} from '../db/repo'
import { db } from '../db/db'
import { RATING_KEYS, STATUS_LABELS, STATUS_ORDER, type WatchStatus } from '../types'
import { exportExcel, fieldLabels, guessField, mapRows, readWorkbook, type ImportField, type ImportResult, type Sheet } from '../lib/excel'
import { searchTv, tvDetails } from '../lib/tmdb'
import { bestMatch, completeCandidate, searchFreePosters } from '../lib/freePosters'
import { StatusBadge } from '../components/ui'
import { BackupSection } from '../components/BackupSection'
import { showUpdateDialog, useUpdateState } from '../components/UpdateDialog'

export default function SettingsPage() {
  const settings = useSettings()
  const dramas = useDramas()
  const loc = useLocation()
  const [wipe, setWipe] = useState('')

  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [loc.hash])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="h-display text-2xl font-bold">Einstellungen</h1>

      <BackupSection />

      <ImportSection existing={new Set((dramas ?? []).map((d) => d.title.toLowerCase()))} />

      <section className="card space-y-3 p-5">
        <h2 className="h-display text-lg font-bold">📤 Excel-Export</h2>
        <p className="text-sm text-stone-600 dark:text-rose-100/70">Alle Dramen (Blatt „Dramen“) und Songs (Blatt „OST“) als .xlsx-Datei.</p>
        <button className="btn-outline" onClick={async () => exportExcel(await allDramas(), await allSongs(), settings)} disabled={!dramas?.length}>
          📊 Als Excel herunterladen
        </button>
      </section>

      <TmdbSection />

      <section className="card space-y-3 p-5">
        <h2 className="h-display text-lg font-bold">💗 Bewertungskategorien</h2>
        <p className="text-sm text-stone-600 dark:text-rose-100/70">Benenne die fünf Kategorien so, wie es dir gefällt.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {RATING_KEYS.map((k) => (
            <input
              key={k}
              className="input"
              defaultValue={settings.ratingLabels[k]}
              onBlur={(e) => e.target.value.trim() && saveSettings({ ratingLabels: { ...settings.ratingLabels, [k]: e.target.value.trim() } })}
            />
          ))}
        </div>
      </section>

      <AppSection />

      <section className="card space-y-3 border-red-200 p-5 dark:border-red-500/20">
        <h2 className="h-display text-lg font-bold text-red-600">Gefahrenzone</h2>
        <p className="text-sm text-stone-600 dark:text-rose-100/70">Zum Löschen aller Dramen und Songs „LÖSCHEN“ eintippen.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input w-40" placeholder="LÖSCHEN" value={wipe} onChange={(e) => setWipe(e.target.value)} />
          <button
            className="btn-danger border border-red-200 dark:border-red-500/30"
            disabled={wipe !== 'LÖSCHEN'}
            onClick={async () => {
              if (!confirm('Wirklich ALLE Dramen und Songs löschen? Das kann nicht rückgängig gemacht werden (außer mit einer Sicherung).')) return
              await db.transaction('rw', db.dramas, db.songs, async () => {
                await db.dramas.clear()
                await db.songs.clear()
              })
              setWipe('')
            }}
          >
            Alle Daten löschen
          </button>
        </div>
      </section>
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
      <h2 className="h-display text-lg font-bold">ℹ️ App</h2>
      <p className="text-sm text-stone-600 dark:text-rose-100/70">
        K-Love {version && `Version ${version}`} · Neue Versionen werden dir mit Changelog angeboten und erst nach deiner Zustimmung installiert.
      </p>
      {hasUpdate && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-pink-50 p-3 text-sm dark:bg-pink-400/10">
          <span className="flex-1 font-semibold">✨ Version {update.version} ist verfügbar.</span>
          <button className="btn-primary px-3 py-1 text-sm" onClick={showUpdateDialog}>
            Changelog & Update
          </button>
        </div>
      )}
      <button className="btn-outline" onClick={check} disabled={busy}>
        🔄 Nach Updates suchen
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </section>
  )
}

function TmdbSection() {
  const settings = useSettings()
  const [key, setKey] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [fill, setFill] = useState<{ done: number; total: number } | null>(null)
  const value = key ?? settings.tmdbApiKey ?? ''

  const test = async () => {
    setStatus('Teste …')
    try {
      const r = await searchTv('Goblin', value.trim(), settings.tmdbLanguage)
      await saveSettings({ tmdbApiKey: value.trim() })
      setStatus(`✅ Funktioniert! (${r.length} Treffer für „Goblin“) – gespeichert.`)
    } catch (e) {
      setStatus('❌ ' + (e as Error).message)
    }
  }

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
      <h2 className="h-display text-lg font-bold">🖼️ Poster & Infos</h2>
      <p className="text-sm text-stone-600 dark:text-rose-100/70">
        Poster werden automatisch über <b>TVmaze</b> und <b>Wikipedia</b> gesucht – ganz ohne Anmeldung. Einzelne Poster kannst du beim Bearbeiten eines Dramas selbst auswählen.
      </p>
      <button className="btn-primary" onClick={fillMissing} disabled={!!fill}>
        {fill ? `Suche … ${fill.done}/${fill.total}` : '🖼️ Fehlende Poster automatisch laden'}
      </button>

      <details className="rounded-xl border border-rose-100 p-3 text-sm dark:border-white/10" open={!!settings.tmdbApiKey}>
        <summary className="cursor-pointer font-semibold">Optional: TMDB-Schlüssel für mehr Treffer & Besetzung</summary>
        <div className="mt-3 space-y-3">
          <ol className="list-decimal space-y-0.5 pl-5 text-stone-600 dark:text-rose-100/70">
            <li>
              Kostenlos registrieren auf{' '}
              <a className="font-semibold text-pink-600 underline" href="https://www.themoviedb.org/signup" target="_blank" rel="noreferrer">
                themoviedb.org
              </a>
            </li>
            <li>
              Unter{' '}
              <a className="font-semibold text-pink-600 underline" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
                Einstellungen → API
              </a>{' '}
              einen Schlüssel anfordern (Zweck: privat)
            </li>
            <li>„API-Schlüssel“ oder „Lesezugriffs-Token“ hier einfügen</li>
          </ol>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" type="password" placeholder="API-Schlüssel" value={value} onChange={(e) => setKey(e.target.value)} />
            <button className="btn-outline" onClick={test} disabled={!value.trim()}>
              Testen & speichern
            </button>
          </div>
          {status && <p>{status}</p>}
          {settings.tmdbApiKey && (
            <div className="flex flex-wrap items-center gap-3">
              <label>
                Sprache der Infos{' '}
                <select className="input ml-1 inline-block w-auto py-1" value={settings.tmdbLanguage} onChange={(e) => saveSettings({ tmdbLanguage: e.target.value })}>
                  <option value="de-DE">Deutsch</option>
                  <option value="en-US">Englisch</option>
                  <option value="ko-KR">Koreanisch</option>
                </select>
              </label>
              <button className="btn-ghost" onClick={() => (saveSettings({ tmdbApiKey: undefined }), setKey(''), setStatus(''))}>
                Schlüssel entfernen
              </button>
            </div>
          )}
        </div>
      </details>
    </section>
  )
}


function ImportSection({ existing }: { existing: Set<string> }) {
  const settings = useSettings()
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [mapping, setMapping] = useState<Record<string, ImportField>>({})
  const [scale, setScale] = useState(10)
  const [defaultStatus, setDefaultStatus] = useState<WatchStatus>('completed')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [done, setDone] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const labels = fieldLabels(settings)
  const sheet = sheets?.[sheetIdx]

  const chooseSheet = (all: Sheet[], idx: number) => {
    setSheetIdx(idx)
    const s = all[idx]
    const m: Record<string, ImportField> = {}
    const used = new Set<ImportField>()
    for (const h of s.headers) {
      const g = guessField(h)
      m[h] = g !== 'ignore' && used.has(g) ? 'ignore' : g
      used.add(m[h])
    }
    setMapping(m)
    // Skala raten: höchster Wert in Bewertungsspalten
    const ratingCols = s.headers.filter((h) => ['overallRating', ...RATING_KEYS].includes(m[h]))
    const max = Math.max(0, ...s.rows.flatMap((r) => ratingCols.map((c) => Number(String(r[c]).replace(',', '.')) || 0)))
    setScale(max > 10 ? 100 : max > 5 ? 10 : max > 0 ? 5 : 10)
  }

  const open = async (f: File) => {
    try {
      const s = (await readWorkbook(f)).filter((x) => x.headers.length)
      if (!s.length) return alert('Keine Daten in der Datei gefunden.')
      setSheets(s)
      setResult(null)
      setDone('')
      chooseSheet(s, 0)
    } catch (e) {
      alert('Datei konnte nicht gelesen werden: ' + (e as Error).message)
    }
  }

  useEffect(() => {
    if (sheet) setResult(mapRows(sheet.rows, mapping, scale, existing, defaultStatus))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, mapping, scale, defaultStatus])

  const titleMapped = Object.values(mapping).includes('title')

  const doImport = async () => {
    if (!result) return
    await bulkAddDramas(result.dramas)
    setDone(`✅ ${result.dramas.length} Dramen importiert!`)
    setSheets(null)
    setResult(null)
  }

  return (
    <section className="card space-y-4 p-5" id="import">
      <h2 className="h-display text-lg font-bold">📥 Excel-Import</h2>
      <p className="text-sm text-stone-600 dark:text-rose-100/70">
        Wähle deine Excel-Datei (.xlsx, .xls oder .csv). Danach ordnest du jede Spalte einem Feld zu. Die erste Zeile muss die Spaltenüberschriften enthalten.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => fileRef.current?.click()}>
          📂 Datei auswählen
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv,.ods" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0]).finally(() => (e.target.value = ''))} />
        {done && <span className="font-semibold text-emerald-600">{done}</span>}
      </div>

      {sheets && sheet && (
        <div className="space-y-4">
          {sheets.length > 1 && (
            <label className="block text-sm">
              <span className="label">Tabellenblatt</span>
              <select className="input w-auto" value={sheetIdx} onChange={(e) => chooseSheet(sheets, Number(e.target.value))}>
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name} ({s.rows.length} Zeilen)
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <span className="label">Spalten zuordnen</span>
            <div className="divide-y divide-rose-100 rounded-xl border border-rose-100 dark:divide-white/5 dark:border-white/10">
              {sheet.headers.map((h) => (
                <div key={h} className="grid grid-cols-[1fr_auto] items-center gap-2 p-2 sm:grid-cols-[1fr_1fr_200px]">
                  <div className="font-semibold">{h}</div>
                  <div className="hidden truncate text-xs text-stone-500 sm:block">
                    z. B. {sheet.rows.slice(0, 3).map((r) => String(r[h] instanceof Date ? (r[h] as Date).toLocaleDateString('de-DE') : r[h])).filter(Boolean).join(' · ') || '–'}
                  </div>
                  <select className="input py-1 text-sm" value={mapping[h]} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as ImportField })}>
                    {Object.entries(labels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="label">Bewertungsskala in der Excel</span>
              <select className="input" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                <option value={5}>1–5 (wird ×2 gerechnet)</option>
                <option value={10}>1–10</option>
                <option value={100}>1–100 (wird ÷10 gerechnet)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="label">Status, falls nicht angegeben</span>
              <select className="input" value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value as WatchStatus)}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!titleMapped && <p className="text-sm font-semibold text-red-600">Bitte mindestens eine Spalte als „Titel“ zuordnen.</p>}

          {result && titleMapped && (
            <div className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm dark:bg-white/5">
              <p className="font-bold">
                Vorschau: {result.dramas.length} neue Dramen
                {result.duplicates.length > 0 && <span className="font-normal"> · {result.duplicates.length} schon vorhanden (werden übersprungen)</span>}
                {result.skipped > 0 && <span className="font-normal"> · {result.skipped} Zeilen ohne Titel</span>}
              </p>
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {result.dramas.slice(0, 50).map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <StatusBadge status={d.status} />
                    <span className="flex-1 truncate">{d.title}</span>
                    {(d.overallRating ?? Object.values(d.ratings).find((x) => x !== undefined)) !== undefined && (
                      <span className="font-bold text-pink-600">♥ {d.overallRating ?? '…'}</span>
                    )}
                  </li>
                ))}
                {result.dramas.length > 50 && <li className="text-stone-500">… und {result.dramas.length - 50} weitere</li>}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => (setSheets(null), setResult(null))}>
              Abbrechen
            </button>
            <button className="btn-primary" disabled={!titleMapped || !result?.dramas.length} onClick={doImport}>
              {result?.dramas.length ?? 0} Dramen importieren
            </button>
          </div>
          {<p className="text-xs text-stone-500">Tipp: Danach unter „Poster & Infos“ → „Fehlende Poster automatisch laden“.</p>}
        </div>
      )}
    </section>
  )
}
