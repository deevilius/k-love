import { describe, expect, it } from 'vitest'
import { avgRating, localDay } from './util'
import { episodesPerMonth, watchedEpisodes } from './stats'
import { detectSource, embedUrl, youtubeVideoId } from './music'
import { bestMatch, type PosterCandidate } from './freePosters'
import { emptyDrama } from '../db/repo'

describe('localDay', () => {
  it('nimmt das lokale Datum, nicht UTC', () => {
    // 00:30 Uhr Ortszeit ist in Deutschland in UTC noch der Vortag
    expect(localDay(new Date(2026, 5, 1, 0, 30))).toBe('2026-06-01')
    expect(localDay(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})

describe('avgRating', () => {
  it('mittelt alle Kategorien, auch eigene', () => {
    expect(avgRating({ ratings: { story: 8, c_abc: 6 } })).toBe(7)
    expect(avgRating({ ratings: { story: 7, acting: 8, ending: 8 } })).toBe(7.7)
    expect(avgRating({ ratings: {} })).toBeUndefined()
  })
})

describe('Statistik', () => {
  it('zählt Rewatches bei den gesehenen Episoden mit', () => {
    expect(watchedEpisodes(emptyDrama({ status: 'completed', episodes: 16, rewatchCount: 1 }))).toBe(32)
    expect(watchedEpisodes(emptyDrama({ status: 'watching', episodes: 16, currentEpisode: 3 }))).toBe(3)
  })

  it('verteilt das Episoden-Log auf die letzten 12 Monate', () => {
    const now = new Date(2026, 10, 15)
    const months = episodesPerMonth([emptyDrama({ watchLog: { '2026-11-01': 2, '2026-10-31': 1, '2024-01-01': 5 } })], now)
    expect(months).toHaveLength(12)
    expect(months.at(-1)).toMatchObject({ key: '2026-11', value: 2 })
    expect(months.at(-2)).toMatchObject({ key: '2026-10', value: 1 })
    expect(months.reduce((a, m) => a + m.value, 0)).toBe(3)
  })
})

describe('Musik-Links', () => {
  it('erkennt YouTube-Video-IDs', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=abc123&list=x')).toBe('abc123')
    expect(youtubeVideoId('https://youtu.be/xyz')).toBe('xyz')
    expect(youtubeVideoId('https://www.youtube.com/shorts/sh1')).toBe('sh1')
    expect(youtubeVideoId('kein link')).toBeNull()
  })

  it('baut Embed-Adressen', () => {
    expect(embedUrl('https://youtu.be/xyz')).toContain('youtube-nocookie.com/embed/xyz')
    expect(embedUrl('https://open.spotify.com/track/123')).toBe('https://open.spotify.com/embed/track/123')
    expect(detectSource('https://open.spotify.com/track/123')).toBe('spotify')
  })
})

describe('bestMatch', () => {
  const c = (title: string, year: number, korean = true): PosterCandidate => ({ key: title + year, source: 'TVmaze', title, year, posterUrl: 'x', korean, info: {} })
  it('bevorzugt den exakten Titel', () => {
    expect(bestMatch([c('Goblin 2', 2020), c('Goblin', 2016)], 'Goblin')?.year).toBe(2016)
  })
  it('nimmt lieber nichts als etwas Falsches', () => {
    expect(bestMatch([c('Something Else', 2010, false)], 'Goblin', 2016)).toBeUndefined()
  })
})
