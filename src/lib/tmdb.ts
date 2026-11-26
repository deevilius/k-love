const BASE = 'https://api.themoviedb.org/3'
export const IMG = (path: string | null | undefined, size = 'w500') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined

export interface TmdbSearchResult {
  id: number
  name: string
  original_name: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
  origin_country?: string[]
}

export interface TmdbDetails {
  title: string
  originalTitle?: string
  year?: number
  episodes?: number
  episodeRuntime?: number
  genres: string[]
  actors: string[]
  platform?: string
  posterUrl?: string
  backdropUrl?: string
  overview?: string
  tmdbId: number
}

/** API-Key (v3) oder Lese-Token (v4, beginnt mit "eyJ") – beides wird unterstützt. */
async function get<T>(path: string, key: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  else url.searchParams.set('api_key', key)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers })
  if (res.status === 401) throw new Error('TMDB-Schlüssel ungültig – bitte in den Einstellungen prüfen.')
  if (!res.ok) throw new Error(`TMDB-Fehler ${res.status}`)
  return res.json() as Promise<T>
}

export async function searchTv(query: string, key: string, language: string, koreanOnly = true) {
  const data = await get<{ results: TmdbSearchResult[] }>('/search/tv', key, {
    query,
    language,
    include_adult: 'false',
  })
  const results = data.results ?? []
  if (!koreanOnly) return results
  const kr = results.filter((r) => r.origin_country?.includes('KR'))
  return kr.length ? kr : results
}

interface RawDetails {
  id: number
  name: string
  original_name: string
  first_air_date?: string
  number_of_episodes?: number
  episode_run_time?: number[]
  genres?: { name: string }[]
  networks?: { name: string }[]
  poster_path?: string | null
  backdrop_path?: string | null
  overview?: string
  aggregate_credits?: { cast?: { name: string }[] }
  'watch/providers'?: { results?: Record<string, { flatrate?: { provider_name: string }[] }> }
}

export async function tvDetails(id: number, key: string, language: string): Promise<TmdbDetails> {
  const d = await get<RawDetails>(`/tv/${id}`, key, {
    language,
    append_to_response: 'aggregate_credits,watch/providers',
  })
  const providers = d['watch/providers']?.results
  const flat = providers?.DE?.flatrate ?? providers?.US?.flatrate ?? []
  const platform = flat[0]?.provider_name ?? d.networks?.[0]?.name
  return {
    title: d.name,
    originalTitle: d.original_name !== d.name ? d.original_name : undefined,
    year: d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : undefined,
    episodes: d.number_of_episodes,
    episodeRuntime: d.episode_run_time?.[0],
    genres: (d.genres ?? []).map((g) => g.name),
    actors: (d.aggregate_credits?.cast ?? []).slice(0, 8).map((c) => c.name),
    platform: normalizePlatform(platform),
    posterUrl: IMG(d.poster_path),
    backdropUrl: IMG(d.backdrop_path, 'w1280'),
    overview: d.overview || undefined,
    tmdbId: d.id,
  }
}

function normalizePlatform(p?: string) {
  if (!p) return undefined
  if (/netflix/i.test(p)) return 'Netflix'
  if (/viki/i.test(p)) return 'Viki'
  if (/disney/i.test(p)) return 'Disney+'
  if (/amazon|prime/i.test(p)) return 'Prime Video'
  if (/apple/i.test(p)) return 'Apple TV+'
  return p
}
