import { useState } from 'react'
import { addSong, deleteSong, moveSong, updateSong, useSongs } from '../db/repo'
import { detectSource, embedUrl, isCollection, spotifySearchUrl, youtubeSearchUrl } from '../lib/music'
import type { Drama, Song } from '../types'
import { cx } from '../lib/util'

const SOURCE_ICON = { youtube: '▶️', spotify: '🟢', other: '🔗' }

export default function OstSection({ drama }: { drama: Drama }) {
  const songs = useSongs(drama.id)
  const [playing, setPlaying] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const query = `${drama.title} OST`

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-display text-lg font-bold">🎵 OST & Musik</h2>
        <div className="flex flex-wrap gap-1.5">
          <a className="btn-ghost text-xs" href={youtubeSearchUrl(query)} target="_blank" rel="noreferrer">
            Auf YouTube suchen ↗
          </a>
          <a className="btn-ghost text-xs" href={spotifySearchUrl(query)} target="_blank" rel="noreferrer">
            Auf Spotify suchen ↗
          </a>
          {!adding && (
            <button className="btn-primary text-xs" onClick={() => setAdding(true)}>
              ➕ Song
            </button>
          )}
        </div>
      </div>

      {adding && (
        <SongForm
          onCancel={() => setAdding(false)}
          onSave={async (s) => {
            await addSong({ ...s, dramaId: drama.id })
            setAdding(false)
          }}
        />
      )}

      {songs && songs.length === 0 && !adding && (
        <p className="text-sm text-stone-500 dark:text-rose-100/60">
          Noch keine Songs. Kopiere einen YouTube- oder Spotify-Link (Song, Album oder Playlist) und füge ihn hier hinzu.
        </p>
      )}

      <ul className="space-y-2">
        {songs?.map((s, i) => {
          const embed = embedUrl(s.url, true)
          const open = playing === s.id
          if (editing === s.id)
            return (
              <li key={s.id}>
                <SongForm
                  initial={s}
                  onCancel={() => setEditing(null)}
                  onSave={async (v) => {
                    await updateSong(s.id, v)
                    setEditing(null)
                  }}
                />
              </li>
            )
          return (
            <li key={s.id} className="rounded-xl border border-rose-100 dark:border-white/10">
              <div className="flex items-center gap-2 p-2">
                <button
                  className={cx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-white shadow',
                    open ? 'bg-purple-600' : 'bg-pink-600 hover:bg-pink-700',
                  )}
                  onClick={() => (embed ? setPlaying(open ? null : s.id) : window.open(s.url, '_blank', 'noopener'))}
                  title={embed ? (open ? 'Player schließen' : 'Abspielen') : 'Link öffnen'}
                >
                  {open ? '■' : '▶'}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{s.title}</div>
                  <div className="truncate text-xs text-stone-500 dark:text-rose-100/60">
                    {SOURCE_ICON[s.source]} {s.artist || (s.source === 'other' ? s.url : s.source === 'youtube' ? 'YouTube' : 'Spotify')}
                  </div>
                </div>
                <div className="flex shrink-0 items-center text-stone-400">
                  <button className="rounded p-1.5 hover:bg-rose-100 disabled:opacity-30 dark:hover:bg-white/10" disabled={i === 0} onClick={() => moveSong(drama.id, s.id, -1)} title="Nach oben">
                    ↑
                  </button>
                  <button
                    className="rounded p-1.5 hover:bg-rose-100 disabled:opacity-30 dark:hover:bg-white/10"
                    disabled={i === songs.length - 1}
                    onClick={() => moveSong(drama.id, s.id, 1)}
                    title="Nach unten"
                  >
                    ↓
                  </button>
                  <a className="rounded p-1.5 hover:bg-rose-100 dark:hover:bg-white/10" href={s.url} target="_blank" rel="noreferrer" title="Original öffnen">
                    ↗
                  </a>
                  <button className="rounded p-1.5 hover:bg-rose-100 dark:hover:bg-white/10" onClick={() => setEditing(s.id)} title="Bearbeiten">
                    ✎
                  </button>
                  <button
                    className="rounded p-1.5 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/10"
                    onClick={() => confirm(`„${s.title}“ entfernen?`) && deleteSong(s.id)}
                    title="Entfernen"
                  >
                    🗑
                  </button>
                </div>
              </div>
              {open && embed && (
                <div className="px-2 pb-2">
                  <iframe
                    src={embed}
                    title={s.title}
                    className={cx('w-full rounded-lg border-0', s.source === 'youtube' ? 'aspect-video' : isCollection(s.url) ? 'h-[352px]' : 'h-[152px]')}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SongForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Song
  onSave: (s: Pick<Song, 'title' | 'artist' | 'url' | 'source'>) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState(initial?.url ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [artist, setArtist] = useState(initial?.artist ?? '')
  const [err, setErr] = useState('')
  const source = detectSource(url)
  const embeddable = url ? embedUrl(url) !== null : true

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^(https?:\/\/|spotify:)/i.test(url.trim())) return setErr('Bitte einen gültigen Link einfügen.')
    onSave({ url: url.trim(), title: title.trim() || 'Ohne Titel', artist: artist.trim() || undefined, source })
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl bg-rose-50 p-3 dark:bg-white/5">
      <div>
        <label className="label">Link (YouTube oder Spotify)</label>
        <input className="input" value={url} onChange={(e) => (setUrl(e.target.value), setErr(''))} placeholder="https://www.youtube.com/watch?v=… oder https://open.spotify.com/track/…" autoFocus />
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        {url && (
          <p className="mt-1 text-xs text-stone-500">
            {source === 'youtube' ? '▶️ YouTube erkannt' : source === 'spotify' ? '🟢 Spotify erkannt' : '🔗 Wird als normaler Link gespeichert'}
            {!embeddable && source !== 'other' && ' – kann nicht eingebettet werden, wird als Link geöffnet'}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">Songtitel</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Give You My Heart" />
        </div>
        <div>
          <label className="label">Interpret</label>
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="z. B. IU" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn-primary">
          Speichern
        </button>
      </div>
    </form>
  )
}
