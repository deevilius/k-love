import type { SongSource } from '../types'

export function detectSource(url: string): SongSource {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  if (/spotify\.com|^spotify:/i.test(url)) return 'spotify'
  return 'other'
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const m = u.pathname.match(/\/(embed|shorts|live)\/([^/?]+)/)
    return m ? m[2] : null
  } catch {
    return null
  }
}

function youtubeList(url: string): string | null {
  try {
    return new URL(url).searchParams.get('list')
  } catch {
    return null
  }
}

/** Liefert die Embed-URL für einen iframe, oder null wenn nicht einbettbar. */
export function embedUrl(url: string, autoplay = false): string | null {
  const src = detectSource(url)
  if (src === 'youtube') {
    const id = youtubeId(url)
    const list = youtubeList(url)
    const ap = autoplay ? '1' : '0'
    if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=${ap}${list ? `&list=${list}` : ''}`
    if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=${ap}`
    return null
  }
  if (src === 'spotify') {
    // spotify:track:ID oder https://open.spotify.com/(intl-de/)track/ID
    const uri = url.match(/^spotify:(track|album|playlist|artist|episode):([A-Za-z0-9]+)/)
    if (uri) return `https://open.spotify.com/embed/${uri[1]}/${uri[2]}`
    const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode)\/([A-Za-z0-9]+)/)
    if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`
    return null
  }
  return null
}

export function isCollection(url: string) {
  return /\/(album|playlist)\//.test(url) || /[?&]list=/.test(url)
}

export function youtubeSearchUrl(q: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
}
export function spotifySearchUrl(q: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(q)}`
}
