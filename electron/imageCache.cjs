// Lokaler Zwischenspeicher für Poster: klove-img://cache/<base64url der Original-URL>
// Einmal geladen, kommt das Bild danach immer von der Festplatte – auch offline und
// wenn der Anbieter die Adresse ändert. Unbenutzte Bilder werden nach 180 Tagen gelöscht.
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
const TYPES = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]))
const MAX_BYTES = 15 * 1024 * 1024
const MAX_AGE = 180 * 24 * 60 * 60 * 1000

/** klove-img-URL → Original-URL (nur https), sonst null */
function decodeUrl(reqUrl) {
  try {
    const { host, pathname } = new URL(reqUrl)
    if (host !== 'cache') return null
    const b64 = pathname.slice(1).replace(/-/g, '+').replace(/_/g, '/')
    const url = Buffer.from(b64, 'base64').toString('utf8')
    const u = new URL(url)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

function createImageCache(dir, fetchFn) {
  const keyOf = (url) => crypto.createHash('sha256').update(url).digest('hex').slice(0, 40)
  const find = (key) => {
    for (const ext of Object.values(EXT)) {
      const f = path.join(dir, `${key}.${ext}`)
      if (fs.existsSync(f)) return { file: f, type: TYPES[ext] }
    }
    return null
  }
  const pending = new Map()

  async function load(url) {
    const key = keyOf(url)
    const hit = find(key)
    if (hit) {
      // Zugriffszeit merken, damit häufig genutzte Bilder nicht aufgeräumt werden
      const t = new Date()
      fs.promises.utimes(hit.file, t, t).catch(() => {})
      return { data: await fs.promises.readFile(hit.file), type: hit.type }
    }
    if (!pending.has(key)) {
      pending.set(
        key,
        (async () => {
          const res = await fetchFn(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
          const ext = EXT[type]
          if (!ext) throw new Error(`Kein Bild (${type || 'unbekannt'})`)
          const data = Buffer.from(await res.arrayBuffer())
          if (data.length > MAX_BYTES) throw new Error('Bild zu groß')
          await fs.promises.mkdir(dir, { recursive: true })
          const file = path.join(dir, `${key}.${ext}`)
          await fs.promises.writeFile(file + '.tmp', data)
          await fs.promises.rename(file + '.tmp', file)
          return { data, type }
        })().finally(() => pending.delete(key)),
      )
    }
    return pending.get(key)
  }

  /** Handler für protocol.handle */
  async function handle(req) {
    const url = decodeUrl(req.url)
    if (!url) return new Response('Ungültige Adresse', { status: 400 })
    try {
      const { data, type } = await load(url)
      return new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=31536000, immutable' } })
    } catch (e) {
      return new Response(String(e?.message ?? e), { status: 502 })
    }
  }

  /** Lange nicht benutzte Bilder löschen */
  async function prune(now = Date.now()) {
    let names = []
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      return 0
    }
    let removed = 0
    for (const n of names) {
      const f = path.join(dir, n)
      try {
        const st = await fs.promises.stat(f)
        if (now - st.mtimeMs > MAX_AGE) {
          await fs.promises.unlink(f)
          removed++
        }
      } catch {
        /* egal */
      }
    }
    return removed
  }

  return { handle, prune, load }
}

module.exports = { createImageCache, decodeUrl }
