import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { getSettings, newId } from '../db/repo'
import { parseSongTitle } from './music'
import type { Drama, Song } from '../types'

/** Nur in der Desktop-App möglich (YouTube-Suche läuft im Hauptprozess) */
export const canFindOst = () => !!window.klove?.youtube

// ---------- Status der Suche je Drama (für die Anzeige auf der Drama-Seite) ----------
export type OstStatus = 'searching' | 'none'
const status = new Map<string, OstStatus>()
const listeners = new Set<() => void>()
function setStatus(dramaId: string, s: OstStatus | undefined) {
  if (s) status.set(dramaId, s)
  else status.delete(dramaId)
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
export const useOstStatus = (dramaId: string) => useSyncExternalStore(subscribe, () => status.get(dramaId))

const songCount = (dramaId: string) => db.songs.where('dramaId').equals(dramaId).count()

/** Playlist-ID aus einem YouTube-Link, z. B. …/playlist?list=PL… */
export function youtubeListId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('list')
  } catch {
    return null
  }
}

/** Die Videos einer YouTube-Playlist als neue Songs (noch nicht gespeichert) */
async function playlistSongs(listId: string, dramaId: string): Promise<Omit<Song, 'order'>[]> {
  const items = (await window.klove?.youtube.playlistItems(listId)) ?? []
  return items.map((v) => ({
    id: newId(),
    dramaId,
    ...parseSongTitle(v.title, v.channel),
    url: `https://www.youtube.com/watch?v=${v.id}`,
    source: 'youtube' as const,
  }))
}

/**
 * Hinterlegt die OST von YouTube, wenn das Drama noch keine Songs hat:
 * die Songs der gefundenen OST-Playlist einzeln, sonst die Playlist als Ganzes, sonst ein OST-Video.
 * Liefert true, wenn etwas hinzugefügt wurde.
 * force = auch wenn „OST automatisch hinterlegen“ ausgeschaltet ist (manuell ausgelöst).
 */
export async function ensureOst(drama: Pick<Drama, 'id' | 'title'>, { force = false } = {}): Promise<boolean> {
  const yt = window.klove?.youtube
  const title = drama.title.trim()
  if (!yt || !title) return false
  if (!force && (await getSettings()).autoOst === false) return false
  if ((await songCount(drama.id)) > 0) return false

  setStatus(drama.id, 'searching')
  let added = false
  try {
    added = await findAndAdd(drama.id, title)
    return added
  } catch (e) {
    console.warn('OST-Suche fehlgeschlagen:', e)
    return false
  } finally {
    setStatus(drama.id, added ? undefined : 'none')
  }
}

async function findAndAdd(dramaId: string, title: string): Promise<boolean> {
  const hit = await window.klove!.youtube.findOst(title)
  if (!hit) return false

  let songs: Omit<Song, 'order'>[] = []
  if (hit.kind === 'playlist') songs = await playlistSongs(hit.id, dramaId)
  if (!songs.length)
    songs = [
      hit.kind === 'playlist'
        ? { id: newId(), dramaId, title: `${title} – OST`, artist: 'YouTube-Playlist', url: `https://www.youtube.com/playlist?list=${hit.id}`, source: 'youtube' }
        : { id: newId(), dramaId, ...parseSongTitle(hit.title), url: `https://www.youtube.com/watch?v=${hit.id}`, source: 'youtube' },
    ]

  return db.transaction('rw', db.songs, async () => {
    // Während der Suche könnte jemand schon selbst einen Song eingetragen haben
    if ((await songCount(dramaId)) > 0) return false
    await db.songs.bulkAdd(songs.map((s, i) => ({ ...s, order: i })))
    return true
  })
}

/**
 * Ersetzt einen gespeicherten YouTube-Playlist-Eintrag durch die einzelnen Songs der Playlist (an derselben Stelle).
 * Liefert die Anzahl neuer Songs (0 = nichts geändert).
 */
export async function splitPlaylistSong(song: Song): Promise<number> {
  const listId = youtubeListId(song.url)
  if (!listId || !window.klove?.youtube) return 0
  const fresh = await playlistSongs(listId, song.dramaId)
  if (!fresh.length) return 0
  await db.transaction('rw', db.songs, db.playlists, async () => {
    const list = await db.songs.where('dramaId').equals(song.dramaId).sortBy('order')
    const i = list.findIndex((s) => s.id === song.id)
    if (i < 0) return
    const next = [...list.slice(0, i), ...fresh, ...list.slice(i + 1)].map((s, order) => ({ ...s, order }))
    await db.songs.delete(song.id)
    await db.songs.bulkPut(next)
    // aus eigenen Playlists entfernen (eine ganze Playlist ist dort ohnehin nicht abspielbar)
    await db.playlists.toCollection().modify((p) => {
      p.songIds = p.songIds.filter((id) => id !== song.id)
    })
  })
  return fresh.length
}
