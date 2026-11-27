import type { SongSource } from '../types'

export function detectSource(url: string): SongSource {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  if (/spotify\.com|^spotify:/i.test(url)) return 'spotify'
  return 'other'
}

/** Klammern, die nur Koreanisch enthalten, z. B. „(자꾸만 웃게 돼)“ */
const HANGUL_PARENS = /\s*\(([^)A-Za-z]*[가-힣][^)A-Za-z]*)\)/g
const NOISE_BRACKETS = /\[(?:MV|M\/V|Official[^\]]*|Lyrics?[^\]]*|Han[^\]]*|Color Coded[^\]]*|가사[^\]]*|Audio|Eng[^\]]*)\]/gi
const NOISE_PARENS = /\((?:Official[^)]*|Lyrics?[^)]*|Audio|MV|M\/V|Visualizer|가사)\)/gi
const NOISE_TAIL = /\s*\b(?:Official\s+)?(?:Lyrics?|Lyric Video|MV|M\/V|Audio)\s*$/i
const OST_HINT = /\s*[([][^)\]]*\b(?:ost|soundtrack)\b[^)\]]*[)\]]/gi

/**
 * Macht aus einem YouTube-Videotitel Songtitel und Interpret, z. B.
 *  „[MV] Crush - Love You With All My Heart(미안해 미워해 사랑해)“ → Crush / Love You With All My Heart
 *  „Crash Landing On You Ost Part 11 - IU (I Give You My Heart) [Han|Rom|Eng] Lyrics“ → IU / I Give You My Heart
 */
export function parseSongTitle(raw: string, channel = ''): { title: string; artist?: string } {
  const s = raw.replace(NOISE_BRACKETS, '').replace(NOISE_PARENS, '').replace(NOISE_TAIL, '').replace(/\s+/g, ' ').trim()
  let title = s
  let artist = ''
  const parts = s.split(/\s+[-–—|]\s+/)
  if (parts.length >= 2) {
    const [a, ...rest] = parts
    const b = rest.join(' - ')
    if (/\b(?:ost|soundtrack)\b/i.test(a)) {
      // „<Drama> OST Part 4 - Interpret (Titel)“
      const m = b.match(/^(.+?)\s*\((.+)\)\s*$/)
      if (m) [artist, title] = [m[1], m[2]]
      else title = b
    } else [artist, title] = [a, b]
  }
  const clean = (x: string) => x.replace(OST_HINT, '').replace(HANGUL_PARENS, '').replace(/\s+/g, ' ').trim()
  title = clean(title) || s || raw
  artist =
    clean(artist) ||
    channel
      .replace(/\[[^\]]*\]\s*/g, '')
      .replace(/\s*-\s*Topic$|\s+Official$/i, '')
      .trim()
  return { title, artist: artist || undefined }
}

/** Video-ID aus einem YouTube-Link (oder null) */
export const youtubeVideoId = (url: string) => youtubeId(url)

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
