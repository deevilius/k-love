import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import Library from './pages/Library'
import DramaDetail from './pages/DramaDetail'
import DramaForm from './pages/DramaForm'
const Stats = lazy(() => import('./pages/Stats'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Music = lazy(() => import('./pages/Music'))
const Discover = lazy(() => import('./pages/Discover'))
const Hangul = lazy(() => import('./pages/Hangul'))
import { MiniPlayer } from './components/MiniPlayer'
import { getPlayer, togglePlay, usePlayer } from './lib/player'
import { DialogHost } from './components/Dialogs'
import { cx } from './lib/util'
import { db } from './db/db'
import { startAutoBackup } from './lib/autoBackup'
import { BackupReminder } from './components/BackupReminder'
import { UpdateDialog } from './components/UpdateDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useDismiss } from './components/ui'
import { playIntroOnStartup, toggleIntroMute, useIntroEnabled, useIntroPlaying } from './lib/lofi'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
}

/** Hauptseiten – immer sichtbar in der Kopfzeile */
const MAIN: NavItem[] = [
  { to: '/', label: 'Bibliothek', icon: '📚', end: true },
  { to: '/discover', label: 'Entdecken', icon: '✨' },
  { to: '/music', label: 'Musik', icon: '🎵' },
  { to: '/hangul', label: 'Koreanisch', icon: '한' },
]
/** Seltener gebraucht – im „⋯“-Menü */
const MORE: NavItem[] = [
  { to: '/stats', label: 'Statistik', icon: '📊' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️' },
]
/** Reihenfolge für Alt+1 … 6 */
const SHORTCUT_PAGES = [...MAIN, ...MORE]

/** Handy: Koreanisch wandert unter „Mehr“, damit die untere Leiste 5 Felder hat */
const MOBILE_TABS = MAIN.filter((n) => n.to !== '/hangul')
const MOBILE_MORE = [...MAIN.filter((n) => n.to === '/hangul'), ...MORE]

const isActivePath = (pathname: string, n: NavItem) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + '/'))

const MOBILE_ITEM = 'flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold'
const mobileColor = (active: boolean) => (active ? 'text-pink-600 dark:text-pink-300' : 'text-stone-500 dark:text-rose-100/60')

/** Aufklappmenü mit Seitenlinks (Desktop: „⋯“ in der Kopfzeile, Handy: „Mehr“ in der unteren Leiste) */
function MoreMenu({ items, variant }: { items: NavItem[]; variant: 'header' | 'mobile' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  useDismiss(box, open, () => setOpen(false))
  useEffect(() => setOpen(false), [loc.pathname])
  const active = items.some((n) => isActivePath(loc.pathname, n))
  const mobile = variant === 'mobile'

  return (
    <div ref={box} className={cx(!mobile && 'relative')}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Weitere Seiten"
        title="Weitere Seiten"
        onClick={() => setOpen(!open)}
        className={
          mobile
            ? cx(MOBILE_ITEM, 'w-full', mobileColor(active || open))
            : cx('btn', active ? 'bg-pink-600 text-white' : 'text-stone-600 hover:bg-rose-100 dark:text-rose-100 dark:hover:bg-white/10')
        }
      >
        <span className={cx('font-black', mobile ? 'text-xl leading-7' : 'text-lg leading-5')} aria-hidden>
          ⋯
        </span>
        {mobile && 'Mehr'}
      </button>
      {open && (
        <div
          role="menu"
          className={cx(
            'absolute z-50 w-52 space-y-0.5 rounded-xl border border-rose-100 bg-white p-1.5 text-sm shadow-xl dark:border-white/10 dark:bg-[#251a2c]',
            mobile ? 'right-2 bottom-full mb-2' : 'top-full right-0 mt-1.5',
          )}
        >
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              role="menuitem"
              className={({ isActive }) =>
                cx('flex items-center gap-2.5 rounded-lg px-3 py-2 font-semibold', isActive ? 'bg-pink-600 text-white' : 'hover:bg-rose-50 dark:hover:bg-white/5')
              }
            >
              <span aria-hidden className="w-5 text-center">
                {n.icon}
              </span>
              {n.label}
              {!mobile && <span className="ml-auto text-xs opacity-50">Alt+{SHORTCUT_PAGES.indexOf(n) + 1}</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

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
        nav(SHORTCUT_PAGES[Number(e.key) - 1].to)
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
        <NavLink to="/" className="flex shrink-0 items-center gap-2">
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
        <nav className="hidden items-center gap-1 sm:flex">
          {MAIN.map((n, i) => (
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
          <NavLink to="/new" title="Drama hinzufügen (Strg+N)" aria-label="Drama hinzufügen" className="btn-primary ml-1">
            <span aria-hidden>➕</span>
            <span className="hidden lg:inline">Hinzufügen</span>
          </NavLink>
          <MoreMenu items={MORE} variant="header" />
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
          <Route path="/hangul" element={<Hangul />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>

      {/* außerhalb der Routen: Musik läuft beim Seitenwechsel weiter */}
      <MiniPlayer />

      {/* Untere Navigation fürs Smartphone */}
      <nav className="fixed inset-x-0 bottom-0 z-30 relative grid grid-cols-5 border-t border-rose-100 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-white/10 dark:bg-[#1a1220]/90">
        {[MOBILE_TABS[0], MOBILE_TABS[1], null, MOBILE_TABS[2]].map((n) =>
          n ? (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx(MOBILE_ITEM, mobileColor(isActive))}>
              <span className="text-xl" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ) : (
            <NavLink key="/new" to="/new" aria-label="Drama hinzufügen" title="Drama hinzufügen" className="grid place-items-center">
              {({ isActive }) => (
                <span className={cx('grid h-11 w-11 place-items-center rounded-full text-xl text-white shadow-md', isActive ? 'bg-pink-700 ring-2 ring-pink-300' : 'bg-pink-600')}>
                  ➕
                </span>
              )}
            </NavLink>
          ),
        )}
        <MoreMenu items={MOBILE_MORE} variant="mobile" />
      </nav>
    </div>
  )
}
