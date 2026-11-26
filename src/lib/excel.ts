import * as XLSX from 'xlsx'
import { emptyDrama } from '../db/repo'
import { DEFAULT_RATING_LABELS, RATING_KEYS, STATUS_LABELS, type Drama, type RatingKey, type Settings, type Song, type WatchStatus } from '../types'
import { downloadBlob, splitList } from './util'

/** Felder, denen eine Excel-Spalte zugeordnet werden kann */
export type ImportField =
  | 'ignore'
  | 'title'
  | 'originalTitle'
  | 'year'
  | 'episodes'
  | 'platform'
  | 'genres'
  | 'actors'
  | 'status'
  | 'currentEpisode'
  | 'overallRating'
  | RatingKey
  | 'favorite'
  | 'notes'
  | 'tags'
  | 'startedAt'
  | 'finishedAt'

export function fieldLabels(s: Settings): Record<ImportField, string> {
  return {
    ignore: '— ignorieren —',
    title: 'Titel',
    originalTitle: 'Originaltitel',
    year: 'Jahr',
    episodes: 'Episoden',
    platform: 'Plattform',
    genres: 'Genres',
    actors: 'Schauspieler',
    status: 'Status',
    currentEpisode: 'Aktuelle Episode',
    overallRating: 'Gesamtnote',
    story: `Note: ${DEFAULT_RATING_LABELS.story}`,
    acting: `Note: ${DEFAULT_RATING_LABELS.acting}`,
    chemistry: `Note: ${DEFAULT_RATING_LABELS.chemistry}`,
    ost: `Note: ${DEFAULT_RATING_LABELS.ost}`,
    ending: `Note: ${DEFAULT_RATING_LABELS.ending}`,
    favorite: 'Favorit',
    notes: 'Notizen',
    tags: 'Tags',
    startedAt: 'Begonnen am',
    finishedAt: 'Beendet am',
  }
}

const GUESS: [ImportField, RegExp][] = [
  ['originalTitle', /original|koreanisch|hangul/i],
  ['title', /titel|title|name|serie|drama|show/i],
  ['year', /jahr|year/i],
  ['currentEpisode', /aktuell|current|progress|fortschritt/i],
  ['episodes', /episode|folgen|eps/i],
  ['platform', /plattform|platform|anbieter|streaming|sender/i],
  ['genres', /genre/i],
  ['actors', /schauspiel|darsteller|actor|cast|besetzung/i],
  ['status', /status|gesehen|watched/i],
  ['story', /story|handlung|geschichte|plot/i],
  ['chemistry', /chemie|chemistry|romanti/i],
  ['ost', /\bost\b|musik|music|soundtrack/i],
  ['ending', /^ende$|ending/i],
  ['favorite', /favorit|fav|lieblings/i],
  ['notes', /notiz|kommentar|bemerkung|comment|meinung/i],
  ['overallRating', /bewertung|note|rating|punkte|sterne|gesamt|score/i],
  ['tags', /tag/i],
  ['startedAt', /begonnen|start/i],
  ['finishedAt', /beendet|fertig am|finished/i],
]

export function guessField(header: string): ImportField {
  for (const [f, re] of GUESS) if (re.test(header)) return f
  return 'ignore'
}

export interface Sheet {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

export async function readWorkbook(file: File): Promise<Sheet[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true })
    const first = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0] ?? []
    const headers = first.map((h) => String(h ?? '').trim()).filter(Boolean)
    return { name, headers, rows }
  })
}

function num(v: unknown): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined
  if (typeof v === 'number') return v
  const s = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/)
  return s ? Number(s[0]) : undefined
}

const clamp = (n: number) => Math.max(0, Math.min(10, n))

/** Bewertung in 0–10 umrechnen. scaleMax = Skala in ihrer Excel (z. B. 5, 10 oder 100). */
function rating(v: unknown, scaleMax: number): number | undefined {
  if (typeof v === 'string' && /[★⭐]/.test(v)) {
    const stars = (v.match(/[★⭐]/g) ?? []).length
    return clamp(Math.round((stars / 5) * 10 * 2) / 2)
  }
  const n = num(v)
  if (n === undefined) return undefined
  return clamp(Math.round((n / scaleMax) * 10 * 2) / 2)
}

function bool(v: unknown) {
  if (typeof v === 'boolean') return v
  return /^(ja|yes|x|true|1|wahr|♥|❤|⭐|★)/i.test(String(v).trim())
}

function date(v: unknown): string | undefined {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // lokale Zeit verwenden, damit es keinen Tagesversatz gibt
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v ?? '').trim()
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (de) {
    const y = de[3].length === 2 ? `20${de[3]}` : de[3]
    return `${y}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return undefined
}

function status(v: unknown): WatchStatus | undefined {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return undefined
  if (/abgebrochen|drop|nicht weiter/.test(s)) return 'dropped'
  if (/pause|hold/.test(s)) return 'on-hold'
  if (/gerade|aktuell|läuft|watching|schaue/.test(s)) return 'watching'
  if (/merk|plan|will|möchte|watchlist|todo|noch nicht|nein/.test(s)) return 'watchlist'
  if (/fertig|gesehen|komplett|done|completed|ja|yes|^x$|beendet|durch/.test(s)) return 'completed'
  return undefined
}

export interface ImportResult {
  dramas: Drama[]
  duplicates: string[]
  skipped: number
}

export function mapRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, ImportField>,
  scaleMax: number,
  existingTitles: Set<string>,
  defaultStatus: WatchStatus,
): ImportResult {
  const result: ImportResult = { dramas: [], duplicates: [], skipped: 0 }
  const seen = new Set(existingTitles)
  const statusMapped = Object.values(mapping).includes('status')
  for (const row of rows) {
    const d = emptyDrama({ status: defaultStatus })
    let rated = false
    for (const [col, field] of Object.entries(mapping)) {
      const v = row[col]
      if (field === 'ignore' || v === '' || v === undefined || v === null) continue
      switch (field) {
        case 'title':
        case 'originalTitle':
        case 'platform':
        case 'notes':
          d[field] = String(v).trim()
          break
        case 'year':
        case 'episodes':
        case 'currentEpisode':
          d[field] = num(v)
          break
        case 'genres':
        case 'actors':
        case 'tags':
          d[field] = splitList(String(v))
          break
        case 'status':
          d.status = status(v) ?? defaultStatus
          break
        case 'overallRating':
          d.overallRating = rating(v, scaleMax)
          if (d.overallRating !== undefined) rated = true
          break
        case 'favorite':
          d.favorite = bool(v)
          break
        case 'startedAt':
        case 'finishedAt':
          d[field] = date(v)
          break
        default:
          if ((RATING_KEYS as string[]).includes(field)) {
            const r = rating(v, scaleMax)
            d.ratings[field as RatingKey] = r
            if (r !== undefined) rated = true
          }
      }
    }
    if (!d.title) {
      result.skipped++
      continue
    }
    // Bewertet, aber keine Status-Spalte → als "Fertig" annehmen
    if (!statusMapped && rated) d.status = 'completed'
    const key = d.title.toLowerCase()
    if (seen.has(key)) {
      result.duplicates.push(d.title)
      continue
    }
    seen.add(key)
    result.dramas.push(d)
  }
  return result
}

export function exportExcel(dramas: Drama[], songs: Song[], s: Settings) {
  const L = DEFAULT_RATING_LABELS
  const titleById = new Map(dramas.map((d) => [d.id, d.title]))
  const dramaRows = [...dramas]
    .sort((a, b) => a.title.localeCompare(b.title, 'de'))
    .map((d) => ({
      Titel: d.title,
      Originaltitel: d.originalTitle ?? '',
      Jahr: d.year ?? '',
      Plattform: d.platform ?? '',
      Status: STATUS_LABELS[d.status],
      Episoden: d.episodes ?? '',
      'Aktuelle Episode': d.currentEpisode ?? '',
      Gesamtnote: d.overallRating ?? '',
      [L.story]: d.ratings.story ?? '',
      [L.acting]: d.ratings.acting ?? '',
      [L.chemistry]: d.ratings.chemistry ?? '',
      [L.ost]: d.ratings.ost ?? '',
      [L.ending]: d.ratings.ending ?? '',
      Favorit: d.favorite ? 'ja' : '',
      Genres: d.genres.join(', '),
      Schauspieler: d.actors.join(', '),
      Tags: d.tags.join(', '),
      'Begonnen am': d.startedAt ?? '',
      'Beendet am': d.finishedAt ?? '',
      Notizen: d.notes ?? '',
    }))
  const songRows = songs.map((x) => ({
    Drama: titleById.get(x.dramaId) ?? '',
    Titel: x.title,
    Interpret: x.artist ?? '',
    Link: x.url,
  }))
  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(dramaRows)
  ws1['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 6 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Dramen')
  const ws2 = XLSX.utils.json_to_sheet(songRows.length ? songRows : [{ Drama: '', Titel: '', Interpret: '', Link: '' }])
  ws2['!cols'] = [{ wch: 28 }, { wch: 30 }, { wch: 20 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'OST')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `k-love-${new Date().toISOString().slice(0, 10)}.xlsx`,
  )
}
