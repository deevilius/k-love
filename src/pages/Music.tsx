import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { createPlaylist, deletePlaylist, movePlaylistItem, removeFromPlaylist, renamePlaylist, useAllSongs, useDramas, usePlaylists } from '../db/repo'
import { AddToPlaylist } from '../components/AddToPlaylist'
import { Poster } from '../components/ui'
import { canFindOst, splitPlaylistSong } from '../lib/autoOst'
import { isCollection } from '../lib/music'
import { currentItem, playQueue, toQueueItem, usePlayer, type QueueItem } from '../lib/player'
import { cx } from '../lib/util'
import type { Drama, Song } from '../types'

const muted = 'text-sm text-stone-500 dark:text-rose-100/60'

/** Musik: alle OST-Songs und eigene Playlists */
export default function Music() {
  const { playlistId } = useParams()
  const songs = useAllSongs()
  const dramas = useDramas()
  const playlists = usePlaylists()
  const nav = useNavigate()
  const [newName, setNewName] = useState('')

  const dramaById = useMemo(() => new Map((dramas ?? []).map((d) => [d.id, d])), [dramas])
  const songById = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs])
  const toItem = (s: Song) => toQueueItem(s, dramaById.get(s.dramaId)?.title)

  if (!songs || !dramas || !playlists) return null
  const playlist = playlistId ? playlists.find((p) => p.id === playlistId) : undefined

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    const id = await createPlaylist(newName)
    setNewName('')
    nav(`/music/${id}`)
  }

  const side = (active: boolean) =>
    cx('flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left font-semibold', active ? 'bg-pink-600 text-white' : 'hover:bg-rose-100 dark:hover:bg-white/10')

  return (
    <div className="space-y-5">
      <h1 className="h-display text-2xl font-bold">🎵 Musik</h1>
      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        <aside className="card h-fit space-y-1 p-3">
          <NavLink to="/music" end className={({ isActive }) => side(isActive)}>
            <span>🎶 Alle Songs</span>
          </NavLink>
          <div className="px-3 pt-3 pb-1 text-xs font-bold tracking-wide text-stone-500 uppercase dark:text-rose-100/60">Meine Playlists</div>
          {playlists.map((p) => (
            <NavLink key={p.id} to={`/music/${p.id}`} className={({ isActive }) => side(isActive)}>
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs opacity-70">{p.songIds.length}</span>
            </NavLink>
          ))}
          <form onSubmit={create} className="flex gap-1 pt-2">
            <input className="input py-1.5 text-sm" placeholder="➕ Neue Playlist" value={newName} onChange={(e) => setNewName(e.target.value)} />
            {newName.trim() && (
              <button type="submit" className="btn-primary px-2 py-1 text-xs">
                Anlegen
              </button>
            )}
          </form>
        </aside>

        <section className="min-w-0">
          {playlistId && !playlist ? (
            <div className="card p-5">
              <p>Diese Playlist gibt es nicht mehr.</p>
              <Link to="/music" className="btn-ghost mt-2">
                ← Alle Songs
              </Link>
            </div>
          ) : playlist ? (
            <PlaylistView
              key={playlist.id}
              id={playlist.id}
              name={playlist.name}
              entries={playlist.songIds.flatMap((sid, index) => {
                const song = songById.get(sid)
                return song ? [{ song, index }] : []
              })}
              dramaById={dramaById}
              toItem={toItem}
              onDeleted={() => nav('/music')}
            />
          ) : (
            <AllSongs songs={songs} dramas={dramas} toItem={toItem} />
          )}
        </section>
      </div>
    </div>
  )
}

function SongRow({
  song,
  drama,
  item,
  onPlay,
  children,
  checked,
  onCheck,
}: {
  song: Song
  drama?: Drama
  item: QueueItem | null
  onPlay: () => void
  children?: React.ReactNode
  checked?: boolean
  onCheck?: (v: boolean) => void
}) {
  const player = usePlayer()
  const now = currentItem(player)?.songId === song.id
  return (
    <li className={cx('flex items-center gap-2 rounded-xl p-1.5', now ? 'bg-pink-50 dark:bg-pink-500/10' : 'hover:bg-rose-50/60 dark:hover:bg-white/5')}>
      {onCheck && <input type="checkbox" className="h-4 w-4 shrink-0 accent-pink-600" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`${song.title} auswählen`} />}
      <button
        className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full text-white shadow', now ? 'bg-purple-600' : 'bg-pink-600 hover:bg-pink-700', !item && 'opacity-40')}
        onClick={onPlay}
        disabled={!item}
        title={item ? 'Abspielen' : 'Nicht einzeln abspielbar'}
      >
        {now && player.playing ? '♪' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{song.title}</div>
        <div className="truncate text-xs text-stone-500 dark:text-rose-100/60">{[song.artist, drama?.title].filter(Boolean).join(' · ')}</div>
      </div>
      {children}
    </li>
  )
}

function AllSongs({ songs, dramas, toItem }: { songs: Song[]; dramas: Drama[]; toItem: (s: Song) => QueueItem | null }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [splitting, setSplitting] = useState<{ done: number; total: number } | null>(null)

  const playable = songs.filter((s) => toItem(s))
  const collections = songs.filter((s) => s.source === 'youtube' && isCollection(s.url) && !toItem(s))
  const needle = q.trim().toLowerCase()
  const groups = dramas
    .map((d) => ({
      drama: d,
      songs: playable
        .filter((s) => s.dramaId === d.id)
        .filter((s) => !needle || [s.title, s.artist, d.title].some((x) => x?.toLowerCase().includes(needle)))
        .sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.songs.length)
    .sort((a, b) => a.drama.title.localeCompare(b.drama.title, 'de'))
  const visible = groups.flatMap((g) => g.songs)
  const items = visible.map(toItem).filter((x): x is QueueItem => !!x)

  const toggle = (id: string, on: boolean) => {
    const next = new Set(sel)
    if (on) next.add(id)
    else next.delete(id)
    setSel(next)
  }

  const splitAll = async () => {
    if (!confirm(`${collections.length} gespeicherte YouTube-Playlists in Einzelsongs aufteilen?`)) return
    setSplitting({ done: 0, total: collections.length })
    for (const [i, s] of collections.entries()) {
      await splitPlaylistSong(s).catch(() => 0)
      setSplitting({ done: i + 1, total: collections.length })
    }
    setSplitting(null)
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs flex-1" placeholder="🔎 Song, Interpret oder Drama" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" onClick={() => playQueue(items, 0, { shuffle: false, label: 'Alle Songs' })} disabled={!items.length}>
          ▶ Abspielen
        </button>
        <button className="btn-outline" onClick={() => playQueue(items, 0, { shuffle: true, label: 'Alle Songs' })} disabled={items.length < 2}>
          🔀 Zufällig
        </button>
      </div>

      {collections.length > 0 && canFindOst() && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-sm dark:bg-white/5">
          <span>
            {collections.length} OST {collections.length === 1 ? 'ist' : 'sind'} noch als ganze YouTube-Playlist gespeichert und erscheint hier nicht.
          </span>
          <button className="btn-outline text-xs" onClick={splitAll} disabled={!!splitting}>
            {splitting ? `Teile auf … ${splitting.done}/${splitting.total}` : '✂️ In Einzelsongs aufteilen'}
          </button>
        </div>
      )}

      {sel.size > 0 && (
        <div className="sticky top-20 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-pink-600 px-3 py-2 text-white shadow-lg">
          <span className="font-semibold">{sel.size} ausgewählt</span>
          <AddToPlaylist songIds={[...sel]} label="➕ Zu Playlist hinzufügen" className="bg-white/20 text-white hover:bg-white/30" align="left" onDone={() => setSel(new Set())} />
          <button className="btn-ghost text-xs text-white hover:bg-white/20" onClick={() => setSel(new Set())}>
            Auswahl aufheben
          </button>
        </div>
      )}

      {!groups.length ? (
        <p className={muted}>
          {needle ? 'Nichts gefunden.' : 'Noch keine einzelnen YouTube-Songs. Lass sie unter Einstellungen → „Fehlende OSTs laden“ suchen oder füge auf einer Drama-Seite Songs hinzu.'}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map(({ drama, songs: list }) => {
            const all = list.every((s) => sel.has(s.id))
            return (
              <div key={drama.id} className="space-y-1">
                <div className="flex items-center gap-3">
                  <Poster drama={drama} className="w-10 shrink-0 rounded-md" />
                  <Link to={`/drama/${drama.id}`} className="h-display min-w-0 flex-1 truncate text-lg font-bold hover:underline">
                    {drama.title}
                  </Link>
                  <label className="flex items-center gap-1 text-xs text-stone-500">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-pink-600"
                      checked={all}
                      onChange={(e) => {
                        const next = new Set(sel)
                        list.forEach((s) => (e.target.checked ? next.add(s.id) : next.delete(s.id)))
                        setSel(next)
                      }}
                    />
                    alle
                  </label>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => playQueue(list.map(toItem).filter((x): x is QueueItem => !!x), 0, { shuffle: false, label: drama.title })}
                  >
                    ▶ OST
                  </button>
                </div>
                <ul className="space-y-0.5">
                  {list.map((s) => (
                    <SongRow
                      key={s.id}
                      song={s}
                      item={toItem(s)}
                      onPlay={() => playQueue(items, items.findIndex((x) => x.songId === s.id), { label: 'Alle Songs' })}
                      checked={sel.has(s.id)}
                      onCheck={(v) => toggle(s.id, v)}
                    >
                      <AddToPlaylist songIds={[s.id]} label="➕" className="px-2" />
                    </SongRow>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlaylistView({
  id,
  name,
  entries,
  dramaById,
  toItem,
  onDeleted,
}: {
  id: string
  name: string
  /** index = Position in der gespeicherten Liste (für Verschieben/Entfernen) */
  entries: { song: Song; index: number }[]
  dramaById: Map<string, Drama>
  toItem: (s: Song) => QueueItem | null
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const songs = entries.map((e) => e.song)
  const items = songs.map(toItem).filter((x): x is QueueItem => !!x)
  const iconBtn = 'rounded p-1.5 text-stone-400 hover:bg-rose-100 disabled:opacity-30 dark:hover:bg-white/10'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    await renamePlaylist(id, draft)
    setEditing(false)
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <form onSubmit={save} className="flex flex-1 gap-2">
            <input className="input text-lg font-bold" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <button type="submit" className="btn-primary">
              Speichern
            </button>
            <button type="button" className="btn-ghost" onClick={() => (setDraft(name), setEditing(false))}>
              Abbrechen
            </button>
          </form>
        ) : (
          <>
            <h2 className="h-display min-w-0 flex-1 truncate text-xl font-bold">{name}</h2>
            <button className="btn-ghost text-xs" onClick={() => setEditing(true)} title="Umbenennen">
              ✎ Umbenennen
            </button>
            <button
              className="btn-danger text-xs"
              onClick={async () => {
                if (!confirm(`Playlist „${name}“ löschen? Die Songs selbst bleiben erhalten.`)) return
                await deletePlaylist(id)
                onDeleted()
              }}
            >
              🗑 Löschen
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => playQueue(items, 0, { shuffle: false, label: name })} disabled={!items.length}>
          ▶ Abspielen
        </button>
        <button className="btn-outline" onClick={() => playQueue(items, 0, { shuffle: true, label: name })} disabled={items.length < 2}>
          🔀 Zufällig
        </button>
        <span className={muted}>{songs.length === 1 ? '1 Song' : `${songs.length} Songs`}</span>
      </div>

      {!songs.length ? (
        <p className={muted}>
          Noch leer. Füge Songs unter <Link to="/music" className="font-semibold text-pink-600 hover:underline">„Alle Songs“</Link> oder auf einer Drama-Seite mit „➕“ hinzu.
        </p>
      ) : (
        <ol className="space-y-0.5">
          {entries.map(({ song: s, index }, i) => {
            const item = toItem(s)
            return (
              <SongRow
                key={`${s.id}-${index}`}
                song={s}
                drama={dramaById.get(s.dramaId)}
                item={item}
                onPlay={() => item && playQueue(items, items.findIndex((x) => x.songId === s.id), { shuffle: false, label: name })}
              >
                <div className="flex shrink-0 items-center">
                  <button className={iconBtn} disabled={i === 0} onClick={() => movePlaylistItem(id, index, -1)} title="Nach oben">
                    ↑
                  </button>
                  <button className={iconBtn} disabled={i === songs.length - 1} onClick={() => movePlaylistItem(id, index, 1)} title="Nach unten">
                    ↓
                  </button>
                  <button className={cx(iconBtn, 'hover:text-red-600')} onClick={() => removeFromPlaylist(id, index)} title="Aus Playlist entfernen">
                    ✕
                  </button>
                </div>
              </SongRow>
            )
          })}
        </ol>
      )}
    </div>
  )
}

