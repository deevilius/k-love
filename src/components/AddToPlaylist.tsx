import { useEffect, useRef, useState } from 'react'
import { addToPlaylist, createPlaylist, usePlaylists } from '../db/repo'
import { cx } from '../lib/util'
import { useDismiss } from './ui'

/** Knopf „➕ Playlist“ mit Menü: vorhandene Playlist wählen oder neue anlegen */
export function AddToPlaylist({
  songIds,
  label = '➕ Playlist',
  className,
  onDone,
  align = 'right',
}: {
  songIds: string[]
  label?: string
  className?: string
  onDone?: (msg: string) => void
  align?: 'left' | 'right'
}) {
  const playlists = usePlaylists()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useDismiss(box, open, () => setOpen(false))

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2500)
    return () => clearTimeout(t)
  }, [msg])

  const finish = (text: string) => {
    setOpen(false)
    setName('')
    setMsg(text)
    onDone?.(text)
  }

  const addTo = async (id: string, plName: string) => {
    const n = await addToPlaylist(id, songIds)
    finish(n ? `✅ ${n === 1 ? 'Song' : `${n} Songs`} zu „${plName}“ hinzugefügt` : `Schon in „${plName}“`)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await createPlaylist(name, songIds)
    finish(`✅ Playlist „${name.trim()}“ angelegt`)
  }

  return (
    <div ref={box} className="relative inline-block">
      <button type="button" className={cx('btn-ghost text-xs', className)} onClick={() => setOpen(!open)} disabled={!songIds.length} title="Zu einer eigenen Playlist hinzufügen">
        {label}
      </button>
      {msg && !onDone && <span className="absolute top-full right-0 z-10 mt-1 rounded-lg bg-stone-800 px-2 py-1 text-xs whitespace-nowrap text-white">{msg}</span>}
      {open && (
        <div
          className={cx(
            'absolute top-full z-50 mt-1 w-64 space-y-1 rounded-xl border border-rose-100 bg-white p-2 text-left text-sm shadow-xl dark:border-white/10 dark:bg-[#251a2c]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {playlists?.length ? (
            <div className="max-h-56 overflow-y-auto">
              {playlists.map((p) => (
                <button key={p.id} type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-rose-50 dark:hover:bg-white/5" onClick={() => addTo(p.id, p.name)}>
                  <span className="truncate font-semibold">{p.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-stone-500">{p.songIds.length}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-1 text-xs text-stone-500">Noch keine Playlist – leg gleich eine an:</p>
          )}
          <form onSubmit={create} className="flex gap-1 border-t border-rose-100 pt-2 dark:border-white/10">
            <input className="input py-1 text-sm" placeholder="Neue Playlist …" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!playlists?.length} />
            <button type="submit" className="btn-primary px-2 py-1 text-xs" disabled={!name.trim()}>
              Anlegen
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
