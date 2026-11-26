import { NavLink, Route, Routes } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import Library from './pages/Library'
import DramaDetail from './pages/DramaDetail'
import DramaForm from './pages/DramaForm'
const Stats = lazy(() => import('./pages/Stats'))
const SettingsPage = lazy(() => import('./pages/Settings'))
import { cx } from './lib/util'
import { db } from './db/db'
import { startAutoBackup } from './lib/autoBackup'
import { BackupReminder } from './components/BackupReminder'
import { UpdateDialog } from './components/UpdateDialog'

const NAV = [
  { to: '/', label: 'Bibliothek', icon: '📚', end: true },
  { to: '/new', label: 'Hinzufügen', icon: '➕', end: false },
  { to: '/stats', label: 'Statistik', icon: '📊', end: false },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️', end: false },
]

export default function App() {
  useEffect(() => {
    // Browser bitten, die Daten dauerhaft zu speichern (nicht automatisch löschen)
    navigator.storage?.persist?.().catch(() => {})
    void db.open()
    return startAutoBackup()
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-24 sm:px-6 sm:pb-10">
      <header className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between border-b border-rose-100/70 bg-rose-50/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-white/5 dark:bg-[#1a1220]/80">
        <NavLink to="/" className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="h-display text-2xl font-bold text-pink-700 dark:text-pink-300">K-Love</span>
        </NavLink>
        <nav className="hidden gap-1 sm:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('btn', isActive ? 'bg-pink-600 text-white' : 'text-stone-600 hover:bg-rose-100 dark:text-rose-100 dark:hover:bg-white/10')
              }
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <BackupReminder />
      <UpdateDialog />

      <main className="flex-1">
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/new" element={<DramaForm />} />
          <Route path="/drama/:id" element={<DramaDetail />} />
          <Route path="/drama/:id/edit" element={<DramaForm />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </Suspense>
      </main>

      {/* Untere Navigation fürs Smartphone */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-rose-100 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-white/10 dark:bg-[#1a1220]/90">
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
