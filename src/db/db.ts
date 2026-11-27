import Dexie, { type Table } from 'dexie'
import type { Drama, Playlist, Song } from '../types'

export interface KV {
  key: string
  value: unknown
}

class KLoveDB extends Dexie {
  dramas!: Table<Drama, string>
  songs!: Table<Song, string>
  playlists!: Table<Playlist, string>
  kv!: Table<KV, string>

  constructor() {
    super('k-love')
    this.version(1).stores({
      dramas: 'id, title, status, favorite, updatedAt, tmdbId',
      songs: 'id, dramaId, order',
      kv: 'key',
    })
    // v2: eigene Playlists (bestehende Daten bleiben unverändert)
    this.version(2).stores({
      playlists: 'id, name',
    })
  }
}

export const db = new KLoveDB()
