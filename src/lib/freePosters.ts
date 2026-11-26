/**
 * Poster & Infos aus frei nutzbaren Quellen – ohne Registrierung/API-Schlüssel.
 *  - TVmaze (api.tvmaze.com): Serien-Datenbank mit vielen K-Dramen
 *  - Wikipedia (en): Infobox-Poster von Artikeln über TV-Serien
 */
import type { Drama } from '../types'

export interface PosterCandidate {
  key: string
  source: 'TVmaze' | 'Wikipedia'
  title: string
  year?: number
  posterUrl: string
  korean: boolean
  info: Partial<Drama>
  tvmazeId?: number
}

const GENRE_DE: Record<string, string> = {
  Comedy: 'Komödie',
  Romance: 'Romanze',
  Crime: 'Krimi',
  Family: 'Familie',
  Medical: 'Medizin',
  Legal: 'Justiz',
  History: 'Historie',
  Supernatural: 'Übernatürlich',
  Music: 'Musik',
  Science_Fiction: 'Science-Fiction',
  'Science-Fiction': 'Science-Fiction',
  Adventure: 'Abenteuer',
  War: 'Krieg',
  Sports: 'Sport',
}

const stripHtml = (s?: string | null) => (s ? s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || undefined : undefined)

interface TvmazeShow {
  id: number
  name: string
  language?: string | null
  genres?: string[]
  premiered?: string | null
  averageRuntime?: number | null
  network?: { name: string; country?: { code: string } | null } | null
  webChannel?: { name: string } | null
  image?: { medium?: string; original?: string } | null
  summary?: string | null
}

async function searchTvmaze(q: string): Promise<PosterCandidate[]> {
  const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`)
  if (!res.ok) return []
  const data = (await res.json()) as { show: TvmazeShow }[]
  return data
    .map((r) => r.show)
    .filter((s) => s.image?.original || s.image?.medium)
    .map((s) => {
      const platform = s.webChannel?.name ?? s.network?.name
      return {
        key: `tvmaze-${s.id}`,
        source: 'TVmaze' as const,
        title: s.name,
        year: s.premiered ? Number(s.premiered.slice(0, 4)) : undefined,
        posterUrl: (s.image!.original ?? s.image!.medium)!,
        korean: s.language === 'Korean' || s.network?.country?.code === 'KR',
        tvmazeId: s.id,
        info: {
          posterUrl: (s.image!.original ?? s.image!.medium)!,
          year: s.premiered ? Number(s.premiered.slice(0, 4)) : undefined,
          genres: (s.genres ?? []).map((g) => GENRE_DE[g] ?? g),
          platform: platform ? normalizePlatform(platform) : undefined,
          overview: stripHtml(s.summary),
          episodeRuntime: s.averageRuntime ?? undefined,
        },
      }
    })
}

interface WikiPage {
  pageid: number
  title: string
  index: number
  description?: string
  thumbnail?: { source: string }
}

async function searchWikipedia(q: string): Promise<PosterCandidate[]> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  Object.entries({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${q} South Korean television series`,
    gsrlimit: '8',
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: '500',
    pilicense: 'any', // Poster sind meist "non-free" und würden sonst fehlen
  }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } }
  return Object.values(data.query?.pages ?? {})
    .filter((p) => p.thumbnail && /television series|drama|web series/i.test(p.description ?? ''))
    .sort((a, b) => a.index - b.index)
    .map((p) => {
      const year = p.description?.match(/\b(19|20)\d{2}\b/)?.[0]
      const title = p.title.replace(/\s*\((?:South Korean )?TV series\)$/i, '')
      return {
        key: `wiki-${p.pageid}`,
        source: 'Wikipedia' as const,
        title,
        year: year ? Number(year) : undefined,
        posterUrl: p.thumbnail!.source.replace(/\?.*$/, ''),
        korean: /south korean/i.test(p.description ?? ''),
        info: { posterUrl: p.thumbnail!.source.replace(/\?.*$/, ''), year: year ? Number(year) : undefined },
      }
    })
}

/** Sucht in beiden Quellen gleichzeitig; koreanische Treffer zuerst. */
export async function searchFreePosters(q: string): Promise<PosterCandidate[]> {
  const [tv, wiki] = await Promise.all([searchTvmaze(q).catch(() => []), searchWikipedia(q).catch(() => [])])
  const all = [...tv, ...wiki]
  return all.sort((a, b) => Number(b.korean) - Number(a.korean))
}

/** Beim Auswählen: Episodenzahl bei TVmaze nachladen. */
export async function completeCandidate(c: PosterCandidate): Promise<Partial<Drama>> {
  if (!c.tvmazeId) return c.info
  try {
    const res = await fetch(`https://api.tvmaze.com/shows/${c.tvmazeId}/episodes`)
    if (res.ok) {
      const eps = (await res.json()) as unknown[]
      return { ...c.info, episodes: eps.length || undefined }
    }
  } catch {
    /* egal – dann ohne Episodenzahl */
  }
  return c.info
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')

/** Für das automatische Nachladen: besten Treffer wählen (Titel exakt > koreanisch > Jahr). */
export function bestMatch(list: PosterCandidate[], title: string, year?: number): PosterCandidate | undefined {
  const t = norm(title)
  const yearOk = (c: PosterCandidate) => !!year && c.year === year
  // Koreanische Treffer aus dem passenden Jahr (für Titel wie „Goblin“ ↔ „Guardian: …“)
  const sameYearKorean = list.filter((c) => c.korean && yearOk(c))
  const sameYearTitles = new Set(sameYearKorean.map((c) => norm(c.title)))

  // Regeln, vorsichtig – lieber kein Poster als ein falsches:
  //  exakter Titel → ok · Titel ähnlich → nur mit passendem Jahr ·
  //  Titel anders → nur wenn es genau EINE koreanische Serie aus dem Jahr gibt
  const score = (c: PosterCandidate) => {
    const ct = norm(c.title)
    const base = (c.korean ? 1 : 0) + (yearOk(c) ? 2 : 0) + (c.source === 'TVmaze' ? 0.5 : 0)
    if (ct === t) return 10 + base
    if ((ct.includes(t) || t.includes(ct)) && yearOk(c)) return 6 + base
    if (c.korean && yearOk(c) && sameYearTitles.size === 1) return 5 + base
    return 0
  }
  const ranked = [...list].sort((a, b) => score(b) - score(a))
  const top = ranked[0]
  return top && score(top) > 0 ? top : undefined
}

function normalizePlatform(p: string) {
  if (/netflix/i.test(p)) return 'Netflix'
  if (/viki/i.test(p)) return 'Viki'
  if (/disney/i.test(p)) return 'Disney+'
  if (/amazon|prime/i.test(p)) return 'Prime Video'
  if (/apple/i.test(p)) return 'Apple TV+'
  return p
}
