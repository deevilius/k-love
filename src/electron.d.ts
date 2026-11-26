export {}

declare global {
  interface Window {
    /** Nur in der Desktop-App (Electron) vorhanden */
    klove?: {
      getVersion(): Promise<string>
      checkForUpdates(): Promise<{ status: 'dev' | 'current' | 'downloading' | 'error'; version?: string; message?: string }>
    }
  }
}
