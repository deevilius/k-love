import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addSong,
  deleteDrama,
  emptyDrama,
  episodeChanges,
  exportBackup,
  getTombstones,
  mergeTombstones,
  removeRatingCategory,
  restoreBackup,
  saveDrama,
  undoRestore,
  validateBackup,
  type Backup,
} from './repo'
import type { Drama } from '../types'

const backup = (b: Partial<Backup>): Backup => ({ app: 'k-love', version: 1, exportedAt: new Date().toISOString(), dramas: [], songs: [], playlists: [], settings: {}, ...b })
const drama = (p: Partial<Drama>) => emptyDrama({ title: 'Test', ...p })

beforeEach(async () => {
  await Promise.all([db.dramas.clear(), db.songs.clear(), db.playlists.clear(), db.kv.clear()])
})

describe('episodeChanges', () => {
  it('startet „Schaue gerade“ und setzt das Startdatum', () => {
    const c = episodeChanges(drama({ status: 'watchlist' }), 1, '2026-01-02')
    expect(c).toMatchObject({ currentEpisode: 1, status: 'watching', startedAt: '2026-01-02', watchLog: { '2026-01-02': 1 } })
  })

  it('setzt nach der letzten Folge „Fertig“', () => {
    const c = episodeChanges(drama({ status: 'watching', episodes: 16, currentEpisode: 15, startedAt: '2026-01-01' }), 1, '2026-02-01')
    expect(c).toMatchObject({ currentEpisode: 16, status: 'completed', finishedAt: '2026-02-01' })
  })

  it('geht nicht über die letzte Folge hinaus und nicht unter 0', () => {
    expect(episodeChanges(drama({ episodes: 16, currentEpisode: 16, status: 'watching' }), 1)).toEqual({})
    expect(episodeChanges(drama({ currentEpisode: 0 }), -1)).toEqual({})
  })

  it('−1 nimmt den Tageseintrag zurück und macht aus „Fertig“ wieder „Schaue gerade“', () => {
    const d = drama({ status: 'completed', episodes: 10, currentEpisode: 10, watchLog: { '2026-03-03': 1 } })
    const c = episodeChanges(d, -1, '2026-03-03')
    expect(c.currentEpisode).toBe(9)
    expect(c.status).toBe('watching')
    expect(c.watchLog).toEqual({})
  })
})

describe('Löschungen und Zusammenführen', () => {
  it('merkt sich gelöschte Dramen samt Songs', async () => {
    const d = drama({})
    await saveDrama(d)
    await addSong({ dramaId: d.id, title: 'Song', url: 'https://youtu.be/abc', source: 'youtube' })
    await deleteDrama(d.id)
    const t = await getTombstones()
    expect(t.filter((x) => x.kind === 'drama').map((x) => x.id)).toEqual([d.id])
    expect(t.filter((x) => x.kind === 'song')).toHaveLength(1)
  })

  it('holt ein hier gelöschtes Drama beim Zusammenführen nicht zurück', async () => {
    const d = drama({ updatedAt: '2026-01-01T00:00:00.000Z' })
    const old = backup({ dramas: [d] })
    await saveDrama(d)
    await deleteDrama(d.id)
    const r = await restoreBackup(old, 'merge')
    expect(r.added).toBe(0)
    expect(await db.dramas.get(d.id)).toBeUndefined()
  })

  it('übernimmt ein Drama, das nach dem Löschen in der Sicherung geändert wurde', async () => {
    const d = drama({})
    await saveDrama(d)
    await deleteDrama(d.id)
    const newer = { ...d, updatedAt: new Date(Date.now() + 60_000).toISOString() }
    const r = await restoreBackup(backup({ dramas: [newer] }), 'merge')
    expect(r.added).toBe(1)
  })

  it('löscht hier, was in der Sicherung später gelöscht wurde', async () => {
    const d = drama({ updatedAt: '2026-01-01T00:00:00.000Z' })
    await db.dramas.put(d)
    const r = await restoreBackup(backup({ deleted: [{ kind: 'drama', id: d.id, at: new Date().toISOString() }] }), 'merge')
    expect(r.removed).toBe(1)
    expect(await db.dramas.get(d.id)).toBeUndefined()
    // und Rückgängig holt es wieder
    await undoRestore()
    expect(await db.dramas.get(d.id)).toBeDefined()
  })

  it('aktualisiert Songs, wenn die Sicherung neuer ist', async () => {
    const d = drama({})
    await db.dramas.put(d)
    await db.songs.put({ id: 's1', dramaId: d.id, title: 'Alt', url: 'u', source: 'other', order: 0, updatedAt: '2026-01-01T00:00:00.000Z' })
    const r = await restoreBackup(
      backup({ dramas: [d], songs: [{ id: 's1', dramaId: d.id, title: 'Neu', url: 'u', source: 'other', order: 0, updatedAt: '2026-02-01T00:00:00.000Z' }] }),
      'merge',
    )
    expect(r.songsUpdated).toBe(1)
    expect((await db.songs.get('s1'))?.title).toBe('Neu')
  })

  it('exportiert Löschungen in der Sicherung', async () => {
    const d = drama({})
    await saveDrama(d)
    await deleteDrama(d.id)
    const b = await exportBackup()
    expect(validateBackup(JSON.parse(JSON.stringify(b))).deleted?.some((t) => t.id === d.id)).toBe(true)
  })

  it('mergeTombstones behält den jüngsten Zeitpunkt und wirft Altes weg', () => {
    const now = new Date().toISOString()
    const old = new Date(Date.now() - 400 * 86400000).toISOString()
    const m = mergeTombstones([{ kind: 'drama', id: 'a', at: '2026-01-01T00:00:00.000Z' }], [{ kind: 'drama', id: 'a', at: now }], [{ kind: 'song', id: 'x', at: old }])
    expect(m).toEqual([{ kind: 'drama', id: 'a', at: now }])
  })
})

describe('Bewertungskategorien', () => {
  it('entfernt die Noten einer gelöschten Kategorie aus allen Dramen', async () => {
    const d = drama({ ratings: { story: 8, c_x: 4 } })
    await db.dramas.put(d)
    await removeRatingCategory('c_x')
    expect((await db.dramas.get(d.id))?.ratings).toEqual({ story: 8 })
  })
})
