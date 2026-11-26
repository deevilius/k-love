import { Component, type ReactNode } from 'react'
import { openFeedback, recordError } from '../lib/diagnostics'

/** Fängt Absturzfehler einer Seite ab – statt eines weißen Fensters gibt es eine Erklärung und einen Weg zurück */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    recordError(`Absturz: ${error.message}`)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="card mx-auto max-w-xl space-y-4 p-6 text-center">
        <div className="text-5xl">🥲</div>
        <h1 className="h-display text-2xl font-bold">Hoppla, da ist etwas schiefgelaufen</h1>
        <p className="text-sm text-stone-600 dark:text-rose-100/70">
          Deine Dramen sind sicher – sie sind gespeichert und in deiner Profildatei gesichert. Starte K-Love neu oder melde uns den Fehler, damit wir ihn beheben
          können.
        </p>
        <code className="block rounded-lg bg-rose-50 p-2 text-left text-xs break-words dark:bg-white/5">{error.message}</code>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => ((location.hash = '#/'), location.reload())}>
            🔄 Neu starten
          </button>
          <button className="btn-outline" onClick={() => openFeedback('bug')}>
            🐞 Fehler melden
          </button>
        </div>
      </div>
    )
  }
}
