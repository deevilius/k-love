/**
 * Repository-Schicht: Die UI spricht nur mit diesen Funktionen.
 * Ein späterer Cloud-Sync (z. B. Supabase) kann hier ergänzt werden.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import {
  DEFAULT_RATING_CATEGORIES,
  DEFAULT_SETTINGS,
  type Drama,
  type Playlist,
  type RatingCategory,
  type Settings,
  type Song,
  type Tombstone,
} from '../types'
import { today } from '../lib/util'

export const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

export function emptyDrama(partial: Partial<Drama> = {}): Drama {
  const t = now()
  return {
    id: newId(),
    title: '',
    genres: [],
    actors: [],
    status: 'watchlist',
    ratings: {},
    favorite: false,
    tags: [],
    createdAt: t,
    updatedAt: t,
    ...partial,
  }
}

// ---------- Gelöschte Einträge (für das Zusammenführen von Sicherungen) ----------
const TOMB_KEY = 'tombstones'
/** Löschungen werden ein Jahr lang gemerkt */
const TOMB_MAX_AGE = 365 * 86400000

export async function getTombstones(): Promise<Tombstone[]> {
  return ((await db.kv.get(TOMB_KEY))?.value as Tombstone[] | undefined) ?? []
}

/** Vereinigt Löschlisten (jüngster Zeitpunkt gewinnt) und wirft alte Einträge weg */
export function mergeTombstones(...lists: Tombstone[][]): Tombstone[] {
  const m = new Map<string, Tombstone>()
  const cutoff = new Date(Date.now() - TOMB_MAX_AGE).toISOString()
  for (const t of lists.flat()) {
    if (!t || t.at < cutoff) continue
    const k = `${t.kind}:${t.id}`
    const cur = m.get(k)
    if (!cur || t.at > cur.at) m.set(k, t)
  }
  return [...m.values()]
}

/** Nur innerhalb einer Transaktion mit db.kv aufrufen */
async function addTombstones(kind: Tombstone['kind'], ids: string[]) {
  if (!ids.length) return
  const at = now()
  await db.kv.put({ key: TOMB_KEY, value: mergeTombstones(await getTombstones(), ids.map((id) => ({ kind, id, at }))) })
}

// ---------- Dramen ----------
export const useDramas = () => useLiveQuery(() => db.dramas.toArray(), [])
export const useDrama = (id: string | undefined) =>
  // undefined = lädt noch, null = nicht gefunden
  useLiveQuery(async () => (id ? ((await db.dramas.get(id)) ?? null) : null), [id])

export async function saveDrama(d: Drama) {
  await db.dramas.put({ ...d, updatedAt: now() })
  return d.id
}

export async function updateDrama(id: string, changes: Partial<Drama>) {
  await db.dramas.update(id, { ...changes, updatedAt: now() })
}

export async function deleteDrama(id: string) {
  await db.transaction('rw', db.dramas, db.songs, db.playlists, db.kv, async () => {
    const songIds = await db.songs.where('dramaId').equals(id).primaryKeys()
    await db.songs.bulkDelete(songIds)
    await removeFromAllPlaylists(songIds)
    await db.dramas.delete(id)
    await addTombstones('drama', [id])
    await addTombstones('song', songIds)
  })
}

/**
 * Eine Folge weiter (+1) oder zurück (−1).
 * Startet bei Bedarf „Schaue gerade“ und setzt nach der letzten Folge automatisch „Fertig“.
 * Liefert die Änderungen (leer, wenn es nicht weiter oder zurück geht).
 */
export function episodeChanges(d: Drama, delta: 1 | -1, day = today()): Partial<Drama> {
  const cur = d.status === 'completed' && d.episodes && delta < 0 ? d.episodes : (d.currentEpisode ?? 0)
  const max = d.episodes ?? Infinity
  const next = Math.max(0, Math.min(max, cur + delta))
  if (next === cur) return {}
  const log = { ...(d.watchLog ?? {}) }
  log[day] = Math.max(0, (log[day] ?? 0) + delta)
  if (!log[day]) delete log[day]
  const changes: Partial<Drama> = { currentEpisode: next, watchLog: log }
  if (delta > 0) {
    if (d.status !== 'watching') changes.status = 'watching'
    if (!d.startedAt) changes.startedAt = day
    if (d.episodes && next >= d.episodes) {
      changes.status = 'completed'
      if (!d.finishedAt) changes.finishedAt = day
    }
  } else if (d.status === 'completed') {
    changes.status = 'watching'
  }
  return changes
}

/** Liest den aktuellen Stand in der Transaktion – schnelle Doppelklicks gehen so nicht verloren. Liefert true bei „Fertig“. */
export async function stepEpisode(id: string, delta: 1 | -1): Promise<boolean> {
  return db.transaction('rw', db.dramas, async () => {
    const d = await db.dramas.get(id)
    if (!d) return false
    const changes = episodeChanges(d, delta)
    if (!Object.keys(changes).length) return false
    await db.dramas.update(id, { ...changes, updatedAt: now() })
    return changes.status === 'completed' && d.status !== 'completed'
  })
}

/** Fertiges Drama noch einmal schauen: Zähler hoch, Fortschritt auf 0 */
export const startRewatch = (d: Drama) =>
  updateDrama(d.id, { rewatchCount: (d.rewatchCount ?? 0) + 1, status: 'watching', currentEpisode: 0 })

// ---------- Songs ----------
export const useSongs = (dramaId: string | undefined) =>
  useLiveQuery(
    () => (dramaId ? db.songs.where('dramaId').equals(dramaId).sortBy('order') : []),
    [dramaId],
  )
export const useAllSongs = () => useLiveQuery(() => db.songs.toArray(), [])

export async function addSong(song: Omit<Song, 'id' | 'order'>) {
  const count = await db.songs.where('dramaId').equals(song.dramaId).count()
  await db.songs.add({ ...song, id: newId(), order: count, updatedAt: now() })
}
export const updateSong = (id: string, changes: Partial<Song>) => db.songs.update(id, { ...changes, updatedAt: now() })
export async function deleteSong(id: string) {
  await db.transaction('rw', db.songs, db.playlists, db.kv, async () => {
    await db.songs.delete(id)
    await removeFromAllPlaylists([id])
    await addTombstones('song', [id])
  })
}

export async function moveSong(dramaId: string, id: string, dir: -1 | 1) {
  const list = await db.songs.where('dramaId').equals(dramaId).sortBy('order')
  const i = list.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  const t = now()
  await db.transaction('rw', db.songs, async () => {
    await Promise.all(list.map((s, idx) => db.songs.update(s.id, { order: idx, updatedAt: t })))
  })
}

// ---------- Eigene Playlists ----------
export const usePlaylists = () => useLiveQuery(() => db.playlists.orderBy('name').toArray(), [])

export async function createPlaylist(name: string, songIds: string[] = []) {
  const t = now()
  const p: Playlist = { id: newId(), name: name.trim() || 'Neue Playlist', songIds: [...new Set(songIds)], createdAt: t, updatedAt: t }
  await db.playlists.add(p)
  return p.id
}

export const renamePlaylist = (id: string, name: string) => db.playlists.update(id, { name: name.trim() || 'Playlist', updatedAt: now() })
export const deletePlaylist = (id: string) =>
  db.transaction('rw', db.playlists, db.kv, async () => {
    await db.playlists.delete(id)
    await addTombstones('playlist', [id])
  })

async function editPlaylist(id: string, fn: (songIds: string[]) => string[]) {
  await db.transaction('rw', db.playlists, async () => {
    const p = await db.playlists.get(id)
    if (p) await db.playlists.update(id, { songIds: fn([...p.songIds]), updatedAt: now() })
  })
}

/** Fügt Songs am Ende hinzu (Songs, die schon drin sind, werden übersprungen). Liefert die Anzahl neuer Songs. */
export async function addToPlaylist(id: string, songIds: string[]) {
  let added = 0
  await editPlaylist(id, (list) => {
    const have = new Set(list)
    const fresh = [...new Set(songIds)].filter((s) => !have.has(s))
    added = fresh.length
    return [...list, ...fresh]
  })
  return added
}
export const removeFromPlaylist = (id: string, index: number) => editPlaylist(id, (list) => list.filter((_, i) => i !== index))
export const movePlaylistItem = (id: string, index: number, dir: -1 | 1) =>
  editPlaylist(id, (list) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return list
    ;[list[index], list[j]] = [list[j], list[index]]
    return list
  })

/** Gelöschte Songs aus allen Playlists entfernen (nur innerhalb einer Transaktion mit db.playlists aufrufen) */
async function removeFromAllPlaylists(songIds: string[]) {
  if (!songIds.length) return
  const gone = new Set(songIds)
  await db.playlists
    .filter((p) => p.songIds.some((s) => gone.has(s)))
    .modify((p) => {
      p.songIds = p.songIds.filter((s) => !gone.has(s))
      p.updatedAt = now()
    })
}

// ---------- Einstellungen ----------
export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), [])
  return mergeSettings(row?.value)
}
function mergeSettings(v: unknown): Settings {
  const s = (v ?? {}) as Partial<Settings>
  return { ...DEFAULT_SETTINGS, ...s }
}
export async function getSettings(): Promise<Settings> {
  return mergeSettings((await db.kv.get('settings'))?.value)
}
export async function saveSettings(changes: Partial<Settings>) {
  const cur = await getSettings()
  await db.kv.put({ key: 'settings', value: { ...cur, ...changes } })
}

// ---------- Bewertungskategorien ----------
export const ratingCategories = (s: Settings): RatingCategory[] => (s.ratingCategories?.length ? s.ratingCategories : DEFAULT_RATING_CATEGORIES)
export const useRatingCategories = () => ratingCategories(useSettings())

export const saveRatingCategories = (list: RatingCategory[]) => saveSettings({ ratingCategories: list })

/** Kategorie entfernen – die Noten dieser Kategorie verschwinden aus allen Dramen, damit der Durchschnitt stimmt */
export async function removeRatingCategory(key: string) {
  const cats = ratingCategories(await getSettings()).filter((c) => c.key !== key)
  const t = now()
  await db.transaction('rw', db.dramas, db.kv, async () => {
    await db.dramas
      .filter((d) => d.ratings?.[key] !== undefined)
      .modify((d) => {
        delete d.ratings[key]
        d.updatedAt = t
      })
    await saveSettings({ ratingCategories: cats })
  })
}

// ---------- Backup ----------
export interface Backup {
  app: 'k-love'
  version: 1
  exportedAt: string
  dramas: Drama[]
  songs: Song[]
  /** seit dem Musik-Modul; ältere Sicherungen haben keine */
  playlists?: Playlist[]
  /** Gelöschte Einträge; ältere Sicherungen haben keine */
  deleted?: Tombstone[]
  settings: Settings
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'k-love',
    version: 1,
    exportedAt: now(),
    dramas: await db.dramas.toArray(),
    songs: await db.songs.toArray(),
    playlists: await db.playlists.toArray(),
    deleted: await getTombstones(),
    settings: await getSettings(),
  }
}

/** Prüft eine eingelesene Datei und liefert die typisierte Sicherung oder wirft einen verständlichen Fehler. */
export function validateBackup(raw: unknown): Backup {
  const b = raw as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== 'k-love') throw new Error('Das ist keine K-Love-Sicherung.')
  if (b.version !== 1) throw new Error(`Unbekannte Sicherungsversion (${String(b.version)}). Bitte K-Love aktualisieren.`)
  if (!Array.isArray(b.dramas)) throw new Error('Die Sicherung enthält keine Dramenliste.')
  if (b.dramas.some((d) => !d || typeof d.id !== 'string' || typeof d.title !== 'string')) throw new Error('Die Sicherung enthält beschädigte Einträge.')
  if (b.songs !== undefined && !Array.isArray(b.songs)) throw new Error('Die Songliste in der Sicherung ist beschädigt.')
  if (b.playlists !== undefined && (!Array.isArray(b.playlists) || b.playlists.some((p) => !p || typeof p.id !== 'string' || !Array.isArray(p.songIds))))
    throw new Error('Die Playlists in der Sicherung sind beschädigt.')
  const deleted = Array.isArray(b.deleted) ? b.deleted.filter((t) => t && typeof t.id === 'string' && typeof t.at === 'string') : []
  return { ...b, songs: b.songs ?? [], playlists: b.playlists ?? [], deleted } as Backup
}

export interface RestoreResult {
  added: number
  updated: number
  skipped: number
  /** Einträge, die hier oder in der Sicherung gelöscht wurden */
  removed: number
  songsAdded: number
  songsUpdated: number
  playlistsAdded: number
}

const UNDO_KEY = 'undoSnapshot'

/**
 * Stellt eine Sicherung wieder her. Vorher wird der aktuelle Stand als Rückgängig-Kopie gespeichert.
 * - replace: aktuelle Dramen/Songs/Einstellungen werden durch die Sicherung ersetzt
 * - merge: Neuere Fassung gewinnt (Dramen, Songs, Playlists). Was auf einer Seite gelöscht wurde,
 *   nachdem die andere es zuletzt geändert hat, bleibt gelöscht.
 */
export async function restoreBackup(raw: Backup, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  const b = validateBackup(raw)
  const snapshot = await exportBackup()
  const res: RestoreResult = { added: 0, updated: 0, skipped: 0, removed: 0, songsAdded: 0, songsUpdated: 0, playlistsAdded: 0 }
  const playlists = b.playlists ?? []
  await db.transaction('rw', db.dramas, db.songs, db.playlists, db.kv, async () => {
    await db.kv.put({ key: UNDO_KEY, value: snapshot })
    if (mode === 'replace') {
      await db.dramas.clear()
      await db.songs.clear()
      await db.playlists.clear()
      await db.dramas.bulkPut(b.dramas)
      await db.songs.bulkPut(b.songs)
      await db.playlists.bulkPut(playlists)
      await db.kv.put({ key: TOMB_KEY, value: mergeTombstones(b.deleted ?? []) })
      res.playlistsAdded = playlists.length
      // Zeitpunkt der letzten Sicherung dieses Geräts behalten
      if (b.settings) await db.kv.put({ key: 'settings', value: { ...b.settings, lastBackupAt: snapshot.settings.lastBackupAt, lastAutoBackupHash: undefined } })
      res.added = b.dramas.length
      res.songsAdded = b.songs.length
      return
    }

    const localTomb = new Map((snapshot.deleted ?? []).map((t) => [`${t.kind}:${t.id}`, t.at]))
    const remoteTomb = new Map((b.deleted ?? []).map((t) => [`${t.kind}:${t.id}`, t.at]))
    /** hier gelöscht, nachdem die Sicherung den Eintrag zuletzt geändert hat */
    const deletedHere = (kind: Tombstone['kind'], id: string, changedAt?: string) => {
      const at = localTomb.get(`${kind}:${id}`)
      return at !== undefined && at >= (changedAt ?? '')
    }

    // Dramen
    const local = new Map(snapshot.dramas.map((d) => [d.id, d]))
    const put: Drama[] = []
    for (const d of b.dramas) {
      if (deletedHere('drama', d.id, d.updatedAt)) {
        res.skipped++
        continue
      }
      const cur = local.get(d.id)
      if (!cur) {
        put.push(d)
        res.added++
      } else if ((d.updatedAt ?? '') > (cur.updatedAt ?? '')) {
        put.push(d)
        res.updated++
      } else res.skipped++
    }
    await db.dramas.bulkPut(put)
    // In der Sicherung gelöscht, hier seitdem nicht mehr geändert → hier auch löschen
    const goneDramas = snapshot.dramas.filter((d) => {
      const at = remoteTomb.get(`drama:${d.id}`)
      return at !== undefined && (d.updatedAt ?? '') < at
    })
    const goneDramaIds = new Set(goneDramas.map((d) => d.id))
    await db.dramas.bulkDelete([...goneDramaIds])
    res.removed += goneDramaIds.size

    // Songs
    const localSongs = new Map(snapshot.songs.map((s) => [s.id, s]))
    const putSongs: Song[] = []
    for (const s of b.songs) {
      if (deletedHere('song', s.id, s.updatedAt) || deletedHere('drama', s.dramaId) || goneDramaIds.has(s.dramaId)) continue
      const cur = localSongs.get(s.id)
      if (!cur) {
        putSongs.push(s)
        res.songsAdded++
      } else if ((s.updatedAt ?? '') > (cur.updatedAt ?? '')) {
        putSongs.push(s)
        res.songsUpdated++
      }
    }
    await db.songs.bulkPut(putSongs)
    const goneSongIds = snapshot.songs
      .filter((s) => goneDramaIds.has(s.dramaId) || (remoteTomb.has(`song:${s.id}`) && (s.updatedAt ?? '') < remoteTomb.get(`song:${s.id}`)!))
      .map((s) => s.id)
    await db.songs.bulkDelete(goneSongIds)

    // Playlists: fehlende ergänzen, vorhandene nur, wenn die Sicherung neuer ist
    const localPl = new Map((snapshot.playlists ?? []).map((p) => [p.id, p]))
    const putPl = playlists.filter((p) => {
      if (deletedHere('playlist', p.id, p.updatedAt)) return false
      const cur = localPl.get(p.id)
      if (!cur) res.playlistsAdded++
      return !cur || (p.updatedAt ?? '') > (cur.updatedAt ?? '')
    })
    await db.playlists.bulkPut(putPl)
    const gonePl = (snapshot.playlists ?? []).filter((p) => {
      const at = remoteTomb.get(`playlist:${p.id}`)
      return at !== undefined && (p.updatedAt ?? '') < at
    })
    await db.playlists.bulkDelete(gonePl.map((p) => p.id))
    res.removed += gonePl.length
    await removeFromAllPlaylists(goneSongIds)

    await db.kv.put({ key: TOMB_KEY, value: mergeTombstones(snapshot.deleted ?? [], b.deleted ?? []) })
  })
  return res
}

export const useUndoSnapshot = () => useLiveQuery(async () => ((await db.kv.get(UNDO_KEY))?.value as Backup | undefined) ?? null, [])

/** Macht die letzte Wiederherstellung rückgängig. */
export async function undoRestore() {
  const snap = (await db.kv.get(UNDO_KEY))?.value as Backup | undefined
  if (!snap) throw new Error('Nichts zum Rückgängigmachen vorhanden.')
  await db.transaction('rw', db.dramas, db.songs, db.playlists, db.kv, async () => {
    await db.dramas.clear()
    await db.songs.clear()
    await db.playlists.clear()
    await db.dramas.bulkPut(snap.dramas)
    await db.songs.bulkPut(snap.songs)
    await db.playlists.bulkPut(snap.playlists ?? [])
    await db.kv.put({ key: TOMB_KEY, value: snap.deleted ?? [] })
    await db.kv.put({ key: 'settings', value: snap.settings })
    await db.kv.delete(UNDO_KEY)
  })
}

export const discardUndoSnapshot = () => db.kv.delete(UNDO_KEY)

export async function bulkAddDramas(list: Drama[]) {
  await db.dramas.bulkPut(list)
}

export async function allDramas() {
  return db.dramas.toArray()
}
export async function allSongs() {
  return db.songs.toArray()
}
