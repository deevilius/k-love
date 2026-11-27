/**
 * Ältere K-Dramen für Entdecken – aus Wikidata (frei nutzbar, CC0, ohne Schlüssel).
 * Wikidata kennt rund 1.200 bekanntere südkoreanische Serien inkl. Alternativtiteln,
 * TVmaze-ID (für Poster) und Netflix-ID. Poster lädt K-Love nur für die angezeigten Serien.
 */
import { db } from '../db/db'
import { mapTvmazeShow, norm, type PosterCandidate, type TvmazeShow } from './freePosters'
import { diversify, tasteMatch, type Taste } from './discover'

const CATALOG_KEY = 'discover.classics.v2'
const SHOWS_KEY = 'discover.tvmazeShows'
const CATALOG_MAX_AGE = 7 * 24 * 60 * 60 * 1000

const QUERY = `SELECT ?item ?links ?start ?netflix ?tvmaze
  (SAMPLE(?en) AS ?title) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) (GROUP_CONCAT(DISTINCT ?g; separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?castName; separator="|") AS ?cast) WHERE {
  VALUES ?type { wd:Q5398426 wd:Q1259759 wd:Q526877 wd:Q21191270 }
  ?item wdt:P31 ?type; wdt:P495 wd:Q884; wikibase:sitelinks ?links.
  FILTER(?links >= 8)
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en)="en") }
  OPTIONAL { ?item rdfs:label|skos:altLabel ?alt FILTER(lang(?alt) IN ("en","de","ko")) }
  OPTIONAL { ?item wdt:P580 ?start }
  OPTIONAL { ?item wdt:P1874 ?netflix }
  OPTIONAL { ?item wdt:P8600 ?tvmaze }
  OPTIONAL { ?item wdt:P161/rdfs:label ?castName FILTER(lang(?castName)="en") }
  OPTIONAL { ?item wdt:P136/rdfs:label ?g FILTER(lang(?g)="en") }
} GROUP BY ?item ?links ?start ?netflix ?tvmaze`

export interface Classic {
  id: string
  title: string
  /** alle Titel (normalisiert) – für den Abgleich mit der Bibliothek */
  names: string[]
  year?: number
  genres: string[]
  /** Besetzung (englische Namen, z. B. „Gong Yoo“) */
  cast: string[]
  /** Anzahl Wikipedia-Sprachversionen – Maß für Bekanntheit */
  links: number
  netflix: boolean
  tvmazeId?: number
}

/** Wikidata-Genres → dieselben deutschen Namen wie bei TVmaze */
const GENRE_RULES: [RegExp, string][] = [
  [/romance|romantic|melodrama/, 'Romanze'],
  [/comedy|sitcom/, 'Komödie'],
  [/fantasy/, 'Fantasy'],
  [/action/, 'Action'],
  [/crime|police|investigative|detective/, 'Krimi'],
  [/mystery|suspense/, 'Mystery'],
  [/thriller/, 'Thriller'],
  [/sageuk|histor/, 'Historie'],
  [/legal/, 'Justiz'],
  [/medical/, 'Medizin'],
  [/family/, 'Familie'],
  [/science fiction/, 'Science-Fiction'],
  [/horror|zombie/, 'Horror'],
  [/supernatural/, 'Übernatürlich'],
  [/music/, 'Musik'],
  [/\bwar\b/, 'Krieg'],
  [/sport/, 'Sport'],
  [/drama/, 'Drama'],
]
/** Keine Dramen: Reality, Kinder-, Lern- und Zeichentrickserien */
const SKIP = /reality|children|educational|animat|variety|documentary|talk show|game show/

function mapGenres(raw: string[]): string[] {
  const out = new Set<string>()
  for (const g of raw) for (const [re, de] of GENRE_RULES) if (re.test(g.toLowerCase())) out.add(de)
  return [...out]
}

interface Binding {
  [k: string]: { value: string } | undefined
}

async function fetchCatalog(): Promise<Classic[]> {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(QUERY)}`
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
  if (!res.ok) throw new Error(`Wikidata ${res.status}`)
  const rows = ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings
  const byId = new Map<string, Classic>()
  for (const b of rows) {
    const id = b.item!.value.split('/').pop()!
    const rawGenres = (b.genres?.value ?? '').split('|').filter(Boolean)
    if (rawGenres.some((g) => SKIP.test(g.toLowerCase()))) continue
    const alts = (b.alts?.value ?? '').split('|').filter(Boolean)
    const title = b.title?.value ?? alts[0]
    if (!title) continue
    const prev = byId.get(id)
    const c: Classic = prev ?? {
      id,
      title,
      names: [],
      year: b.start ? Number(b.start.value.slice(0, 4)) || undefined : undefined,
      genres: mapGenres(rawGenres),
      cast: [],
      links: Number(b.links?.value ?? 0),
      netflix: false,
    }
    c.names = [...new Set([...c.names, ...[title, ...alts].map(norm).filter(Boolean)])]
    c.cast = [...new Set([...c.cast, ...(b.cast?.value ?? '').split('|').filter(Boolean)])]
    if (b.netflix) c.netflix = true
    if (b.tvmaze && !c.tvmazeId) c.tvmazeId = Number(b.tvmaze.value) || undefined
    byId.set(id, c)
  }
  return [...byId.values()]
}

/** Katalog aus dem Speicher; einmal pro Woche neu von Wikidata */
export async function loadClassics(force = false): Promise<Classic[]> {
  const cached = (await db.kv.get(CATALOG_KEY))?.value as { at: number; items: Classic[] } | undefined
  if (cached && !force && Date.now() - cached.at < CATALOG_MAX_AGE) return cached.items
  try {
    const items = await fetchCatalog()
    void db.kv.put({ key: CATALOG_KEY, value: { at: Date.now(), items } })
    void db.kv.delete('discover.classics') // alte Version ohne Besetzung
    return items
  } catch (e) {
    if (cached) return cached.items // lieber alt als gar nichts
    throw e
  }
}

export interface ClassicRec {
  classic: Classic
  platform?: string
  score: number
  reason: string
  source?: string
}


/** Sortiert nach Geschmack + Bekanntheit; alles aus der Bibliothek fliegt raus */
export function recommendClassics(items: Classic[], taste: Taste, providers: string[], exclude: Set<number>): ClassicRec[] {
  const maxLinks = Math.log(Math.max(2, ...items.map((c) => c.links)))
  const thisYear = new Date().getFullYear()
  const out: ClassicRec[] = []
  for (const c of items) {
    if (c.names.some((n) => taste.owned.has(n))) continue
    if (c.tvmazeId && exclude.has(c.tvmazeId)) continue
    if (c.year && c.year >= thisYear) continue // Aktuelles steht schon oben
    const platform = c.netflix ? 'Netflix' : undefined
    const match = tasteMatch(taste, c.genres, c.cast)
    const onMine = platform && providers.includes(platform) ? 1 : 0
    const score = match.score + (Math.log(c.links) / maxLinks) * 2 + onMine * 0.8 + (c.tvmazeId ? 0.3 : 0)
    const reason = match.reason ?? 'Beliebter Klassiker'
    out.push({ classic: c, platform, score, reason, source: match.source })
  }
  return diversify(out)
}

// ---------- Poster & Beschreibung von TVmaze (nur für angezeigte Serien) ----------

type ShowCache = Record<number, TvmazeShow | null>
let showCache: ShowCache | null = null
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchShow(id: number): Promise<TvmazeShow | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.tvmaze.com/shows/${id}`)
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`TVmaze ${res.status}`)
    return (await res.json()) as TvmazeShow
  }
  throw new Error('TVmaze: zu viele Anfragen')
}

/** Lädt fehlende TVmaze-Daten für diese IDs (gespeichert, also nur einmal) */
export async function loadShows(ids: number[]): Promise<ShowCache> {
  showCache ??= (((await db.kv.get(SHOWS_KEY))?.value as ShowCache | undefined) ?? {})
  const cache = showCache
  const queue = ids.filter((id) => !(id in cache))
  if (!queue.length) return { ...cache }
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const s = await fetchShow(id)
        cache[id] = s && {
          id: s.id,
          name: s.name,
          language: s.language,
          genres: s.genres,
          premiered: s.premiered,
          averageRuntime: s.averageRuntime,
          rating: s.rating,
          network: s.network,
          webChannel: s.webChannel,
          image: s.image,
          summary: s.summary,
        }
      } catch {
        /* beim nächsten Mal erneut versuchen */
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  void db.kv.put({ key: SHOWS_KEY, value: cache })
  return { ...cache }
}

/** Wikidata-Eintrag (+ TVmaze-Daten, falls geladen) → Kandidat wie bei der Poster-Suche */
export function classicCandidate(c: Classic, show?: TvmazeShow | null): PosterCandidate {
  if (show) {
    const cand = mapTvmazeShow(show)
    return {
      ...cand,
      title: c.title,
      info: {
        ...cand.info,
        genres: cand.info.genres?.length ? cand.info.genres : c.genres,
        platform: c.netflix ? 'Netflix' : cand.info.platform,
      },
    }
  }
  return {
    key: `wd-${c.id}`,
    source: 'TVmaze',
    title: c.title,
    year: c.year,
    posterUrl: '',
    korean: true,
    tvmazeId: c.tvmazeId,
    info: { year: c.year, genres: c.genres, platform: c.netflix ? 'Netflix' : undefined },
  }
}
