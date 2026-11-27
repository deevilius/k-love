import type { Drama } from '../types'

/** Durchschnitt aller vergebenen Kategorie-Noten (auch eigener Kategorien) */
export function avgRating(d: Pick<Drama, 'ratings'>): number | undefined {
  const vals = Object.values(d.ratings ?? {}).filter((v): v is number => typeof v === 'number')
  if (!vals.length) return undefined
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export function overall(d: Drama): number | undefined {
  return d.overallRating ?? avgRating(d)
}

export function fmtRating(n: number | undefined) {
  return n === undefined ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Datum als JJJJ-MM-TT in der lokalen Zeitzone (toISOString wäre UTC – nachts der Vortag) */
export const localDay = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => localDay()

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}
