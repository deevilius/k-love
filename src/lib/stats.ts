import type { Drama } from '../types'
import { localDay } from './util'

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** Gesehene Episoden inklusive erneuter Durchgänge */
export function watchedEpisodes(d: Drama) {
  const current = d.status === 'completed' ? (d.episodes ?? d.currentEpisode ?? 0) : (d.currentEpisode ?? 0)
  return current + (d.rewatchCount ?? 0) * (d.episodes ?? 0)
}

/** Über „+1 Folge“ erfasste Episoden der letzten 12 Monate */
export function episodesPerMonth(list: Drama[], now = new Date()) {
  const months: { key: string; name: string; value: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: localDay(d).slice(0, 7), name: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, value: 0 })
  }
  const byKey = new Map(months.map((m) => [m.key, m]))
  for (const d of list)
    for (const [day, n] of Object.entries(d.watchLog ?? {})) {
      const m = byKey.get(day.slice(0, 7))
      if (m) m.value += n
    }
  return months
}
