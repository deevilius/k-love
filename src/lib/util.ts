import { RATING_KEYS, type Drama } from '../types'

export function avgRating(d: Pick<Drama, 'ratings'>): number | undefined {
  const vals = RATING_KEYS.map((k) => d.ratings[k]).filter((v): v is number => typeof v === 'number')
  if (!vals.length) return undefined
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export function overall(d: Drama): number | undefined {
  return d.overallRating ?? avgRating(d)
}

export function fmtRating(n: number | undefined) {
  return n === undefined ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export const today = () => new Date().toISOString().slice(0, 10)

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}
