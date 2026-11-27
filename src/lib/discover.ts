/**
 * Empfehlungen für die Entdecken-Seite – aus dem frei nutzbaren TVmaze-Sendeplan.
 * Netflix & Co. haben keine öffentliche Schnittstelle; TVmaze kennt aber, welche
 * koreanischen Serien gerade bei welchem Streaming-Dienst bzw. Sender laufen.
 */
import { db } from '../db/db'
import type { Drama } from '../types'
import { fmtRating, overall } from './util'
import { mapTvmazeShow, norm, type PosterCandidate, type TvmazeShow } from './freePosters'

const PAST_DAYS = 28
const FUTURE_DAYS = 14
/** Heute und künftige Tage werden nach dieser Zeit neu geladen, vergangene nie */
const REFRESH_MS = 12 * 60 * 60 * 1000
const CACHE_KEY = 'discover.days.v2'

type Kind = 'web' | 'tv'

/** Was wir pro Tag behalten: nur koreanische Serien, nur die nötigen Felder */
interface DayShow {
  show: TvmazeShow
  airdate: string
}
interface DayEntry {
  at: number
  shows: DayShow[]
}
type DayCache = Record<string, DayEntry>

interface ScheduleItem {
  airdate: string
  show?: TvmazeShow
  _embedded?: { show?: TvmazeShow }
}

export interface Recommendation {
  candidate: PosterCandidate
  /** Streaming-Dienst (bei TV-Serien leer) */
  platform?: string
  /** Koreanischer Sender, falls kein Streaming-Dienst */
  network?: string
  streaming: boolean
  running: boolean
  rating?: number
  /** Jüngster Ausstrahlungstag im Zeitraum */
  airdate: string
  upcoming: boolean
  score: number
  reason: string
  source?: string
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

function days(): string[] {
  const out: string[] = []
  const base = new Date()
  for (let i = -PAST_DAYS; i <= FUTURE_DAYS; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    out.push(isoDay(d))
  }
  return out
}

const slim = (s: TvmazeShow): TvmazeShow => ({
  id: s.id,
  name: s.name,
  language: s.language,
  genres: s.genres,
  premiered: s.premiered,
  status: s.status,
  type: s.type,
  averageRuntime: s.averageRuntime,
  rating: s.rating,
  network: s.network,
  webChannel: s.webChannel,
  image: s.image,
  summary: s.summary,
})

const isKorean = (s: TvmazeShow) => s.language === 'Korean' || s.network?.country?.code === 'KR'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchDay(kind: Kind, date: string): Promise<DayShow[]> {
  const url = kind === 'web' ? `https://api.tvmaze.com/schedule/web?date=${date}` : `https://api.tvmaze.com/schedule?country=KR&date=${date}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url)
    if (res.status === 429) {
      // TVmaze erlaubt ~20 Anfragen pro 10 s
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`TVmaze ${res.status}`)
    const data = (await res.json()) as ScheduleItem[]
    const seen = new Set<number>()
    const out: DayShow[] = []
    for (const item of data) {
      const show = item._embedded?.show ?? item.show
      // Nur Serien – keine Varietyshows, Reality-Formate oder Preisverleihungen
      if (!show || !isKorean(show) || show.type !== 'Scripted' || seen.has(show.id)) continue
      if (show.genres?.some((g) => g === 'Children' || g === 'Anime')) continue
      seen.add(show.id)
      out.push({ show: slim(show), airdate: item.airdate })
    }
    return out
  }
  throw new Error('TVmaze: zu viele Anfragen')
}

async function readCache(): Promise<DayCache> {
  return ((await db.kv.get(CACHE_KEY))?.value as DayCache | undefined) ?? {}
}

/**
 * Lädt den Sendeplan für den ganzen Zeitraum. Bereits geladene vergangene Tage
 * kommen aus dem Speicher, so dauert nur der allererste Aufruf etwas länger.
 */
export async function loadSchedule(opts: { force?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<DayShow[]> {
  const today = isoDay(new Date())
  const wanted = days()
  const cache = await readCache()
  const keys = wanted.flatMap((d) => (['web', 'tv'] as Kind[]).map((k) => `${k}:${d}`))
  const stale = (key: string) => {
    const e = cache[key]
    if (!e) return true
    const date = key.slice(key.indexOf(':') + 1)
    if (date < today) return false // Vergangenheit ändert sich nicht mehr
    return opts.force || Date.now() - e.at > REFRESH_MS
  }
  const todo = keys.filter(stale)
  let done = 0
  opts.onProgress?.(done, todo.length)

  let failed = 0
  const queue = [...todo]
  const worker = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      const [kind, date] = key.split(':') as [Kind, string]
      try {
        cache[key] = { at: Date.now(), shows: await fetchDay(kind, date) }
      } catch {
        failed++
      }
      opts.onProgress?.(++done, todo.length)
    }
  }
  await Promise.all([worker(), worker(), worker()])

  // Nur den aktuellen Zeitraum behalten
  const next: DayCache = {}
  for (const k of keys) if (cache[k]) next[k] = cache[k]
  void db.kv.put({ key: CACHE_KEY, value: next })
  void db.kv.delete('discover.days') // alter Cache vor dem Serien-Filter

  if (failed && Object.keys(next).length === 0) throw new Error('offline')
  return keys.flatMap((k) => next[k]?.shows ?? [])
}

// ---------- Besetzung der aktuellen Serien ----------

const CAST_KEY = 'discover.casts'
type CastCache = Record<number, string[]>
let castCache: CastCache | null = null

/** Lädt die Hauptbesetzung von TVmaze (einmal pro Serie, danach gespeichert) */
export async function loadCasts(ids: number[]): Promise<CastCache> {
  castCache ??= (((await db.kv.get(CAST_KEY))?.value as CastCache | undefined) ?? {})
  const cache = castCache
  const queue = ids.filter((id) => !(id in cache))
  if (!queue.length) return { ...cache }
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`https://api.tvmaze.com/shows/${id}/cast`)
          if (res.status === 429) {
            await sleep(2000 * (attempt + 1))
            continue
          }
          if (res.ok) cache[id] = ((await res.json()) as { person: { name: string } }[]).slice(0, 12).map((c) => c.person.name)
          else if (res.status === 404) cache[id] = []
        } catch {
          /* beim nächsten Mal erneut */
        }
        break
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  void db.kv.put({ key: CAST_KEY, value: cache })
  return { ...cache }
}

// ---------- Geschmack ----------

/** Genres, die fast jedes Drama hat und nichts über den Geschmack sagen */
const NEUTRAL = new Set(['Drama'])

/** Ein Drama aus der Bibliothek, das dir gefallen (oder missfallen) hat */
interface Rated {
  title: string
  rating?: number
  /** –1 (gar nicht gefallen) … +1.5 (Lieblingsdrama) */
  affinity: number
  genres: Set<string>
  actors: Set<string>
}

export interface Taste {
  genres: Map<string, number>
  /** Schauspieler (normalisiert) → Gewicht und das beste Drama, in dem du sie gesehen hast */
  actors: Map<string, { weight: number; name: string; from: Rated }>
  rated: Rated[]
  platforms: Map<string, number>
  owned: Set<string>
  empty: boolean
}

/**
 * Wie sehr dir ein Drama gefallen hat, aus deiner Bewertung:
 * 10 → +1, 6 → 0, 2 → –1; Favorit +0,5; abgebrochen ist immer negativ.
 */
function affinity(d: Drama): number {
  const r = overall(d)
  let a: number
  if (d.status === 'dropped') a = r !== undefined ? Math.min(-0.5, (r - 6) / 4) : -0.8
  else if (r !== undefined) a = (r - 6) / 4
  else if (d.status === 'completed' || d.status === 'watching') a = 0.3
  else if (d.status === 'watchlist') a = 0.15
  else a = 0
  if (d.favorite) a += 0.5
  return Math.max(-1, Math.min(1.5, a))
}

export function buildTaste(dramas: Drama[]): Taste {
  const genres = new Map<string, number>()
  const actors: Taste['actors'] = new Map()
  const platforms = new Map<string, number>()
  const rated: Rated[] = []
  for (const d of dramas) {
    const a = affinity(d)
    const r: Rated = {
      title: d.title,
      rating: overall(d),
      affinity: a,
      genres: new Set(d.genres.filter((g) => !NEUTRAL.has(g))),
      actors: new Set(d.actors.map(norm).filter(Boolean)),
    }
    if (a !== 0) rated.push(r)
    for (const g of r.genres) genres.set(g, (genres.get(g) ?? 0) + a)
    d.actors.forEach((name) => {
      const k = norm(name)
      if (!k) return
      const cur = actors.get(k)
      if (!cur) actors.set(k, { weight: a, name: name.trim(), from: r })
      else {
        cur.weight += a
        if (a > cur.from.affinity) cur.from = r
      }
    })
    if (d.platform && a > 0) platforms.set(d.platform, (platforms.get(d.platform) ?? 0) + a)
  }
  return { genres, actors, rated, platforms, owned: new Set(dramas.map((d) => norm(d.title))), empty: rated.length === 0 }
}

const joinDe = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} & ${xs.at(-1)}` : xs[0])
const stars = (r?: number) => (r === undefined ? '' : ` (★ ${fmtRating(r)})`)

/**
 * Wie gut passt eine Serie zu deinen Bewertungen?
 * Zählt Genres, Schauspieler und die Ähnlichkeit zu einzelnen Dramen –
 * jeweils gewichtet danach, wie gut du sie bewertet hast.
 */
export function tasteMatch(taste: Taste, genresIn: string[], cast: string[] = []): { score: number; reason?: string; source?: string } {
  if (taste.empty) return { score: 0 }
  const genres = genresIn.filter((g) => !NEUTRAL.has(g))
  const maxGenre = Math.max(1, ...[...taste.genres.values()].map(Math.abs))

  // 1) Genres: positive bei gut bewerteten, negative bei schlecht bewerteten Dramen
  const genreScore = genres.reduce((s, g) => s + (taste.genres.get(g) ?? 0), 0) / maxGenre

  // 2) Schauspieler aus deinen Dramen
  const castKeys = new Set(cast.map(norm))
  const actorHits = [...castKeys].map((k) => taste.actors.get(k)).filter((x) => !!x)
  const actorScore = Math.max(-2, Math.min(3, actorHits.reduce((s, h) => s + h.weight, 0)))

  // 3) Ähnlichkeit zu einzelnen Dramen (gleiche Genres + Schauspieler), mal deiner Bewertung
  let best: { r: Rated; sim: number } | undefined
  let simScore = 0
  for (const r of taste.rated) {
    const shared = genres.filter((g) => r.genres.has(g)).length
    const union = new Set([...genres, ...r.genres]).size || 1
    const sharedActors = [...castKeys].filter((k) => r.actors.has(k)).length
    const sim = shared / union + Math.min(1, sharedActors * 0.5)
    if (sim < 0.5) continue
    simScore += sim * r.affinity
    if (r.affinity > 0.4 && (!best || sim * r.affinity > best.sim * best.r.affinity)) best = { r, sim }
  }
  simScore = Math.max(-2, Math.min(2.5, simScore))

  const score = 2 * genreScore + 1.2 * actorScore + simScore

  // Begründung: das Konkreteste zuerst
  const topActor = actorHits.filter((h) => h.weight > 0.4).sort((a, b) => b.from.affinity - a.from.affinity)[0]
  let reason: string | undefined
  let source: string | undefined
  if (topActor) reason = `Mit ${topActor.name} – aus „${topActor.from.title}“${stars(topActor.from.rating)}`
  if (topActor) source = topActor.from.title
  else if (best && best.sim >= 0.6) {
    reason = `Ähnlich wie „${best.r.title}“${stars(best.r.rating)}`
    source = best.r.title
  }
  else {
    const liked = genres.filter((g) => (taste.genres.get(g) ?? 0) > 0.3).sort((a, b) => (taste.genres.get(b) ?? 0) - (taste.genres.get(a) ?? 0))
    if (liked.length) {
      reason = `Weil du ${joinDe(liked.slice(0, 2))} gut bewertest`
      source = liked[0]
    }
  }
  return { score, reason, source }
}

/**
 * Für Abwechslung: Jede weitere Empfehlung mit demselben Grund (z. B. „Ähnlich wie Goblin“)
 * rutscht etwas nach unten, damit auch andere gut bewertete Dramen zum Zug kommen.
 */
export function diversify<T extends { score: number; source?: string }>(list: T[], penalty = 0.6): T[] {
  const rest = [...list].sort((a, b) => b.score - a.score)
  const used = new Map<string, number>()
  const out: T[] = []
  const eff = (x: T) => x.score - (x.source ? (used.get(x.source) ?? 0) * penalty : 0)
  while (rest.length) {
    let bi = 0
    for (let i = 1; i < rest.length; i++) if (eff(rest[i]) > eff(rest[bi])) bi = i
    const [pick] = rest.splice(bi, 1)
    if (pick.source) used.set(pick.source, (used.get(pick.source) ?? 0) + 1)
    out.push(pick)
  }
  return out
}

// ---------- Empfehlungen ----------

export function recommend(schedule: DayShow[], taste: Taste, casts: Record<number, string[]> = {}): Recommendation[] {
  const today = isoDay(new Date())
  // Pro Serie: den jüngsten bereits gelaufenen Tag merken (sonst den nächsten künftigen)
  const byShow = new Map<number, { show: TvmazeShow; airdate: string }>()
  for (const { show, airdate } of schedule) {
    const cur = byShow.get(show.id)
    const better = !cur || (airdate <= today ? cur.airdate > today || airdate > cur.airdate : cur.airdate > today && airdate < cur.airdate)
    if (better) byShow.set(show.id, { show, airdate })
  }

  const maxPlatform = Math.max(1, ...[...taste.platforms.values()])
  const out: Recommendation[] = []

  for (const { show, airdate } of byShow.values()) {
    const candidate = mapTvmazeShow(show)
    if (taste.owned.has(norm(candidate.title))) continue
    const streaming = !!show.webChannel
    const platform = streaming ? candidate.info.platform : undefined
    const rating = show.rating?.average ?? undefined
    const running = show.status === 'Running'
    const upcoming = airdate > today || show.status === 'In Development'
    const genres = candidate.info.genres ?? []

    const match = tasteMatch(taste, genres, casts[show.id])
    const platformScore = platform ? (taste.platforms.get(platform) ?? 0) / maxPlatform : 0
    const daysAgo = Math.max(0, (Date.parse(today) - Date.parse(airdate)) / 86400000)
    const score =
      match.score +
      (rating ? (rating / 10) * 1.5 : 0.6) +
      (running ? 0.5 : 0) +
      platformScore * 0.8 +
      (1 - Math.min(daysAgo, PAST_DAYS) / PAST_DAYS) * 0.7 +
      (candidate.posterUrl ? 0.3 : -1)

    let reason: string
    if (match.reason) reason = match.reason
    else if (rating && rating >= 7.5) reason = `Gut bewertet (★ ${rating.toFixed(1)})`
    else if (upcoming) reason = 'Startet demnächst'
    else reason = streaming ? `Neu bei ${platform}` : `Läuft auf ${show.network?.name ?? 'koreanischem TV'}`

    out.push({ candidate, platform, network: show.network?.name, streaming, running, rating, airdate, upcoming, score, reason, source: match.source })
  }
  return diversify(out)
}
