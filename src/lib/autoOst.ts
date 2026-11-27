import { db } from '../db/db'
import { addSong, getSettings } from '../db/repo'
import type { Drama } from '../types'

/** Nur in der Desktop-App möglich (YouTube-Suche läuft im Hauptprozess) */
export const canFindOst = () => !!window.klove?.youtube

/**
 * Hinterlegt eine OST von YouTube (Playlist, sonst Video), wenn das Drama noch keine Songs hat.
 * Liefert true, wenn etwas hinzugefügt wurde.
 * force = auch wenn „OST automatisch hinterlegen“ ausgeschaltet ist (manuell ausgelöst).
 */
export async function ensureOst(drama: Pick<Drama, 'id' | 'title'>, { force = false } = {}): Promise<boolean> {
  const yt = window.klove?.youtube
  if (!yt || !drama.title.trim()) return false
  if (!force && (await getSettings()).autoOst === false) return false
  if ((await db.songs.where('dramaId').equals(drama.id).count()) > 0) return false

  const hit = await yt.findOst(drama.title.trim())
  if (!hit) return false
  // Während der Suche könnte jemand schon selbst einen Song eingetragen haben
  if ((await db.songs.where('dramaId').equals(drama.id).count()) > 0) return false

  await addSong(
    hit.kind === 'playlist'
      ? { dramaId: drama.id, title: `${drama.title.trim()} – OST`, artist: 'YouTube-Playlist', url: `https://www.youtube.com/playlist?list=${hit.id}`, source: 'youtube' }
      : { dramaId: drama.id, title: hit.title || `${drama.title.trim()} – OST`, artist: 'YouTube', url: `https://www.youtube.com/watch?v=${hit.id}`, source: 'youtube' },
  )
  return true
}
