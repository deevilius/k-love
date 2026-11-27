import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import Library from './pages/Library'
import DramaDetail from './pages/DramaDetail'
import DramaForm from './pages/DramaForm'
const Stats = lazy(() => import('./pages/Stats'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Music = lazy(() => import('./pages/Music'))
const Discover = lazy(() => import('./pages/Discover'))
import { MiniPlayer } from './components/MiniPlayer'
import { getPlayer, togglePlay, usePlayer } from './lib/player'
import { DialogHost } from './components/Dialogs'
import { cx } from './lib/util'
import { db } from './db/db'
import { startAutoBackup } from './lib/autoBackup'
import { BackupReminder } from './components/BackupReminder'
import { UpdateDialog } from './components/UpdateDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { playIntroOnStartup, toggleIntroMute, useIntroEnabled, useIntroPlaying } from './lib/lofi'

const NAV = [
  { to: '/', label: 'Bibliothek', icon: '📚', end: true },
  { to: '/discover', label: 'Entdecken', icon: '✨', end: false },
  { to: '/new', label: 'Hinzufügen', icon: '➕', end: false },
  { to: '/music', label: 'Musik', icon: '🎵', end: false },
  { to: '/stats', label: 'Statistik', icon: '📊', end: false },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️', end: false },
]

/** Ziel ist ein Eingabefeld oder Bedienelement – dann gehört die Taste dem Element */
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || t.getAttribute('role') === 'slider')

/**
 * Tastenkürzel (auch unter Einstellungen → Tastenkürzel aufgelistet):
 * Strg+F Suche, Strg+N neues Drama, Leertaste Musik an/aus, Alt+1…6 Seiten
 */
function useShortcuts() {
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        const input = document.getElementById('library-search')
        if (loc.pathname === '/' && input) input.focus()
        else nav('/', { state: { focusSearch: Date.now() } })
      } else if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        nav('/new')
      } else if (e.altKey && !ctrl && /^[1-6]$/.test(e.key)) {
        e.preventDefault()
        nav(NAV[Number(e.key) - 1].to)
      } else if (e.key === ' ' && !ctrl && !e.altKey && !isTyping(e.target) && getPlayer().queue.length) {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, loc.pathname])
}

export default function App() {
  const loc = useLocation()
  useShortcuts()
  const introPlaying = useIntroPlaying()
  const introOn = useIntroEnabled()
  const playerActive = usePlayer().queue.length > 0
  useEffect(() => {
    playIntroOnStartup()
    // Browser bitten, die Daten dauerhaft zu speichern (nicht automatisch löschen)
    navigator.storage?.persist?.().catch(() => {})
    void db.open()
    return startAutoBackup()
  }, [])

  return (
    <div className={cx('mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6', playerActive ? 'pb-48 sm:pb-28' : 'pb-24 sm:pb-10')}>
      <header className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between border-b border-rose-100/70 bg-rose-50/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-white/5 dark:bg-[#1a1220]/80">
        <NavLink to="/" className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="h-display text-2xl font-bold text-pink-700 dark:text-pink-300">K-Love</span>
          <span className="rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">Beta</span>
        </NavLink>
        <div className="flex items-center gap-2">
        <button
          className="grid h-9 w-9 place-items-center rounded-full bg-pink-100 text-lg hover:bg-pink-200 dark:bg-white/10 dark:hover:bg-white/20"
          onClick={toggleIntroMute}
          title={introOn ? 'Musik stummschalten' : 'Musik einschalten'}
          aria-label={introOn ? 'Musik stummschalten' : 'Musik einschalten'}
        >
          <span className={cx(introOn && introPlaying && 'animate-pulse')}>{introOn ? '🔊' : '🔇'}</span>
        </button>
        <nav className="hidden gap-1 sm:flex">
          {NAV.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={`${n.label} (Alt+${i + 1})`}
              aria-label={n.label}
              className={({ isActive }) =>
                cx('btn', isActive ? 'bg-pink-600 text-white' : 'text-stone-600 hover:bg-rose-100 dark:text-rose-100 dark:hover:bg-white/10')
              }
            >
              <span aria-hidden>{n.icon}</span>
              <span className="hidden lg:inline">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        </div>
      </header>

      <BackupReminder />
      <UpdateDialog />
      <DialogHost />

      <main className="flex-1">
        {/* key: beim Seitenwechsel wird ein abgefangener Fehler zurückgesetzt */}
        <ErrorBoundary key={loc.pathname}>
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/new" element={<DramaForm />} />
          <Route path="/drama/:id" element={<DramaDetail />} />
          <Route path="/drama/:id/edit" element={<DramaForm />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/music" element={<Music />} />
          <Route path="/music/:playlistId" element={<Music />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>

      {/* außerhalb der Routen: Musik läuft beim Seitenwechsel weiter */}
      <MiniPlayer />

      {/* Untere Navigation fürs Smartphone */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-rose-100 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-white/10 dark:bg-[#1a1220]/90">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-pink-600 dark:text-pink-300' : 'text-stone-500 dark:text-rose-100/60')
            }
          >
            <span className="text-xl" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
