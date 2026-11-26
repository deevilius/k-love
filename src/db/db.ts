import Dexie, { type Table } from 'dexie'
import type { Drama, Song } from '../types'

export interface KV {
  key: string
  value: unknown
}

class KLoveDB extends Dexie {
  dramas!: Table<Drama, string>
  songs!: Table<Song, string>
  kv!: Table<KV, string>

  constructor() {
    super('k-love')
    this.version(1).stores({
      dramas: 'id, title, status, favorite, updatedAt, tmdbId',
      songs: 'id, dramaId, order',
      kv: 'key',
    })
  }
}

export const db = new KLoveDB()
