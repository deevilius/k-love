export type WatchStatus = 'watchlist' | 'watching' | 'completed' | 'on-hold' | 'dropped'

export const STATUS_LABELS: Record<WatchStatus, string> = {
  watchlist: 'Merkliste',
  watching: 'Schaue gerade',
  completed: 'Fertig',
  'on-hold': 'Pausiert',
  dropped: 'Abgebrochen',
}

export const STATUS_ORDER: WatchStatus[] = ['watching', 'watchlist', 'completed', 'on-hold', 'dropped']

/** Schlüssel einer Bewertungskategorie – die fünf Standards oder eigene (c_…) */
export type RatingKey = string

export interface RatingCategory {
  key: RatingKey
  label: string
}

export const DEFAULT_RATING_CATEGORIES: RatingCategory[] = [
  { key: 'story', label: 'Story' },
  { key: 'acting', label: 'Schauspiel' },
  { key: 'chemistry', label: 'Chemie' },
  { key: 'ost', label: 'OST' },
  { key: 'ending', label: 'Ende' },
]

export const MAX_RATING_CATEGORIES = 10

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
  /** Wie oft nach dem ersten Durchgang erneut geschaut */
  rewatchCount?: number
  /** Über „+1 Folge“ erfasste Episoden pro Tag (JJJJ-MM-TT → Anzahl) */
  watchLog?: Record<string, number>
  createdAt: string
  updatedAt: string
}

/** Merkt sich Löschungen, damit Zusammenführen sie nicht wieder zurückholt */
export interface Tombstone {
  kind: 'drama' | 'song' | 'playlist'
  id: string
  at: string
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
  /** fehlt bei Songs aus älteren Versionen */
  updatedAt?: string
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
  /** Eigene Streaming-Anbieter für die Entdecken-Seite (leer = alle) */
  streamingProviders?: string[]
  /** Eigene Bewertungskategorien (leer = die fünf Standards) */
  ratingCategories?: RatingCategory[]
}

export const DEFAULT_SETTINGS: Settings = {}

export const PLATFORMS = ['Netflix', 'Viki', 'Disney+', 'Prime Video', 'Apple TV+', 'Crunchyroll', 'Kocowa', 'Sonstiges']

/** Zur Auswahl unter Einstellungen → Meine Streaming-Anbieter */
export const STREAMING_PROVIDERS = PLATFORMS.filter((p) => p !== 'Sonstiges')
