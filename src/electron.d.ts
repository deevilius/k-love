export {}

export interface BackupConfig {
  dir: string
  enabled: boolean
}
export interface BackupFile {
  name: string
  /** profile = aktuelles Profil, previous = Stand davor, pre-restore = Stand vor der letzten Wiederherstellung */
  kind: 'profile' | 'previous' | 'pre-restore'
  date: string
  size: number
  /** Anzahl Dramen in der Datei, -1 = nicht lesbar */
  dramas: number
}

export interface YoutubeHit {
  kind: 'playlist' | 'video'
  id: string
  title: string
}

export interface YoutubeItem {
  id: string
  title: string
  channel: string
}

export interface UpdateNote {
  version: string
  /** reiner Text, Aufzählungen beginnen mit „• “ */
  text: string
}
export interface UpdateState {
  status: 'idle' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  currentVersion?: string
  releaseDate?: string
  /** alle Versionen seit der installierten, neueste zuerst */
  notes?: UpdateNote[]
  /** true, wenn ältere Versionen fehlen könnten (GitHub nicht erreichbar oder sehr viele Releases) */
  notesIncomplete?: boolean
  percent?: number
  message?: string
}

declare global {
  interface Window {
    /** Nur in der Desktop-App (Electron) vorhanden */
    klove?: {
      getVersion(): Promise<string>
      checkForUpdates(): Promise<{ status: 'dev' | 'current' | 'available' | 'error'; version?: string; message?: string }>
      diagnostics(): Promise<{ version: string; os: string; hasProfile: boolean }>
      adblock: {
        get(): Promise<boolean>
        set(enabled: boolean): Promise<boolean>
      }
      youtube: {
        /** Erste passende OST-Playlist zum Drama-Titel, sonst ein OST-Video */
        findOst(title: string): Promise<YoutubeHit | null>
        /** Die ersten (max. 25) Videos einer Playlist */
        playlistItems(listId: string): Promise<YoutubeItem[]>
      }
      update: {
        getState(): Promise<UpdateState>
        download(): Promise<void>
        install(): Promise<void>
        onState(cb: (state: UpdateState) => void): () => void
      }
      backup: {
        config(): Promise<BackupConfig>
        setEnabled(enabled: boolean): Promise<BackupConfig>
        chooseDir(): Promise<BackupConfig>
        openDir(): Promise<string>
        list(): Promise<BackupFile[]>
        read(name: string): Promise<string>
        write(json: string, kind: 'profile' | 'pre-restore', force?: boolean): Promise<{ name: string; dir: string; skipped: boolean }>
        onRequest(cb: () => Promise<void>): () => void
      }
    }
  }
}
