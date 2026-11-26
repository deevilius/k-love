/**
 * Repository-Schicht: Die UI spricht nur mit diesen Funktionen.
 * Ein späterer Cloud-Sync (z. B. Supabase) kann hier ergänzt werden.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { DEFAULT_SETTINGS, type Drama, type Settings, type Song } from '../types'

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
  await db.transaction('rw', db.dramas, db.songs, async () => {
    await db.songs.where('dramaId').equals(id).delete()
    await db.dramas.delete(id)
  })
}

// ---------- Songs ----------
export const useSongs = (dramaId: string | undefined) =>
  useLiveQuery(
    () => (dramaId ? db.songs.where('dramaId').equals(dramaId).sortBy('order') : []),
    [dramaId],
  )
export const useAllSongs = () => useLiveQuery(() => db.songs.toArray(), [])

export async function addSong(song: Omit<Song, 'id' | 'order'>) {
  const count = await db.songs.where('dramaId').equals(song.dramaId).count()
  await db.songs.add({ ...song, id: newId(), order: count })
}
export const updateSong = (id: string, changes: Partial<Song>) => db.songs.update(id, changes)
export const deleteSong = (id: string) => db.songs.delete(id)

export async function moveSong(dramaId: string, id: string, dir: -1 | 1) {
  const list = await db.songs.where('dramaId').equals(dramaId).sortBy('order')
  const i = list.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  await db.transaction('rw', db.songs, async () => {
    await Promise.all(list.map((s, idx) => db.songs.update(s.id, { order: idx })))
  })
}

// ---------- Einstellungen ----------
export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), [])
  return mergeSettings(row?.value)
}
function mergeSettings(v: unknown): Settings {
  const s = (v ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    ratingLabels: { ...DEFAULT_SETTINGS.ratingLabels, ...(s.ratingLabels ?? {}) },
  }
}
export async function getSettings(): Promise<Settings> {
  return mergeSettings((await db.kv.get('settings'))?.value)
}
export async function saveSettings(changes: Partial<Settings>) {
  const cur = await getSettings()
  await db.kv.put({ key: 'settings', value: { ...cur, ...changes } })
}

// ---------- Backup ----------
export interface Backup {
  app: 'k-love'
  version: 1
  exportedAt: string
  dramas: Drama[]
  songs: Song[]
  settings: Settings
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'k-love',
    version: 1,
    exportedAt: now(),
    dramas: await db.dramas.toArray(),
    songs: await db.songs.toArray(),
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
  return { ...b, songs: b.songs ?? [] } as Backup
}

export interface RestoreResult {
  added: number
  updated: number
  skipped: number
  songsAdded: number
}

const UNDO_KEY = 'undoSnapshot'

/**
 * Stellt eine Sicherung wieder her. Vorher wird der aktuelle Stand als Rückgängig-Kopie gespeichert.
 * - replace: aktuelle Dramen/Songs/Einstellungen werden durch die Sicherung ersetzt
 * - merge: fehlende Dramen kommen dazu, vorhandene nur, wenn die Sicherung neuer ist; Songs nur ergänzen
 */
export async function restoreBackup(b: Backup, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  validateBackup(b)
  const snapshot = await exportBackup()
  const res: RestoreResult = { added: 0, updated: 0, skipped: 0, songsAdded: 0 }
  await db.transaction('rw', db.dramas, db.songs, db.kv, async () => {
    await db.kv.put({ key: UNDO_KEY, value: snapshot })
    if (mode === 'replace') {
      await db.dramas.clear()
      await db.songs.clear()
      await db.dramas.bulkPut(b.dramas)
      await db.songs.bulkPut(b.songs)
      // Zeitpunkt der letzten Sicherung dieses Geräts behalten
      if (b.settings) await db.kv.put({ key: 'settings', value: { ...b.settings, lastBackupAt: snapshot.settings.lastBackupAt, lastAutoBackupHash: undefined } })
      res.added = b.dramas.length
      res.songsAdded = b.songs.length
      return
    }
    const local = new Map(snapshot.dramas.map((d) => [d.id, d]))
    const put: Drama[] = []
    for (const d of b.dramas) {
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
    const songIds = new Set(snapshot.songs.map((s) => s.id))
    const newSongs = b.songs.filter((s) => !songIds.has(s.id))
    await db.songs.bulkAdd(newSongs)
    res.songsAdded = newSongs.length
  })
  return res
}

export const useUndoSnapshot = () => useLiveQuery(async () => ((await db.kv.get(UNDO_KEY))?.value as Backup | undefined) ?? null, [])

/** Macht die letzte Wiederherstellung rückgängig. */
export async function undoRestore() {
  const snap = (await db.kv.get(UNDO_KEY))?.value as Backup | undefined
  if (!snap) throw new Error('Nichts zum Rückgängigmachen vorhanden.')
  await db.transaction('rw', db.dramas, db.songs, db.kv, async () => {
    await db.dramas.clear()
    await db.songs.clear()
    await db.dramas.bulkPut(snap.dramas)
    await db.songs.bulkPut(snap.songs)
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
