export type WatchStatus = 'watchlist' | 'watching' | 'completed' | 'on-hold' | 'dropped'

export const STATUS_LABELS: Record<WatchStatus, string> = {
  watchlist: 'Merkliste',
  watching: 'Schaue gerade',
  completed: 'Fertig',
  'on-hold': 'Pausiert',
  dropped: 'Abgebrochen',
}

export const STATUS_ORDER: WatchStatus[] = ['watching', 'watchlist', 'completed', 'on-hold', 'dropped']

export type RatingKey = 'story' | 'acting' | 'chemistry' | 'ost' | 'ending'
export const RATING_KEYS: RatingKey[] = ['story', 'acting', 'chemistry', 'ost', 'ending']
export const DEFAULT_RATING_LABELS: Record<RatingKey, string> = {
  story: 'Story',
  acting: 'Schauspiel',
  chemistry: 'Chemie',
  ost: 'OST',
  ending: 'Ende',
}

export type Ratings = Partial<Record<RatingKey, number>>

export interface Drama {
  id: string
  title: string
  originalTitle?: string
  year?: number
  episodes?: number
  episodeRuntime?: number
  genres: string[]
  actors: string[]
  platform?: string
  posterUrl?: string
  backdropUrl?: string
  overview?: string
  tmdbId?: number
  status: WatchStatus
  currentEpisode?: number
  startedAt?: string
  finishedAt?: string
  ratings: Ratings
  /** Eigene Gesamtnote 1–10; wenn leer, wird der Mittelwert der Kategorien angezeigt */
  overallRating?: number
  favorite: boolean
  notes?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type SongSource = 'youtube' | 'spotify' | 'other'

export interface Song {
  id: string
  dramaId: string
  title: string
  artist?: string
  url: string
  source: SongSource
  order: number
}

/** Eigene Playlist aus einzelnen (YouTube-)Songs */
export interface Playlist {
  id: string
  name: string
  songIds: string[]
  createdAt: string
  updatedAt: string
}

export interface Settings {
  lastBackupAt?: string
  /** Prüfsumme der letzten automatischen Sicherung – unveränderte Daten werden nicht erneut gesichert */
  lastAutoBackupHash?: string
  /** Erinnerungsbanner bis zu diesem Zeitpunkt ausblenden */
  backupReminderSnoozedUntil?: string
  /** Update-Hinweis bis zu diesem Zeitpunkt nicht von selbst zeigen */
  updateSnoozedUntil?: string
  /** Für diese Version gilt das „später“ – eine neuere Version wird sofort angezeigt */
  updateSnoozedVersion?: string
  /** Diese Update-Version wurde übersprungen */
  skippedUpdateVersion?: string
  /** Beim Speichern automatisch eine OST von YouTube hinterlegen (leer = an) */
  autoOst?: boolean
}

export const DEFAULT_SETTINGS: Settings = {}

export const PLATFORMS = ['Netflix', 'Viki', 'Disney+', 'Prime Video', 'Apple TV+', 'Crunchyroll', 'Kocowa', 'Sonstiges']
