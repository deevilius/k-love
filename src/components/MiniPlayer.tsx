import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/util'
import { currentItem, cycleRepeat, getPlayer, next, prev, setPlaying, setShuffle, stopPlayer, toggleExpanded, togglePlay, usePlayer } from '../lib/player'

/** Das Nötigste der YouTube IFrame Player API */
interface YTPlayer {
  loadVideoById(id: string): void
  cueVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  destroy(): void
}
interface YTEvent {
  data: number
  target: YTPlayer
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const ENDED = 0
const PLAYING = 1
const PAUSED = 2

let apiPromise: Promise<YTNamespace> | null = null
function loadYouTubeApi() {
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT)
    const before = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      before?.()
      resolve(window.YT!)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.onerror = () => {
      apiPromise = null
      s.remove()
      reject(new Error('YouTube nicht erreichbar'))
    }
    document.head.appendChild(s)
  })
  return apiPromise
}

/** Player-Leiste unten – läuft beim Seitenwechsel weiter */
export function MiniPlayer() {
  const s = usePlayer()
  const item = currentItem(s)
  const active = s.queue.length > 0
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YTPlayer | null>(null)
  const ready = useRef(false)
  const loadedId = useRef<string | null>(null)
  const errors = useRef(0)
  /** Zeitpunkt des letzten Songwechsels – YouTube meldet dabei kurz „pausiert“ für das alte Video */
  const switchedAt = useRef(0)
  const [err, setErr] = useState('')

  /** Player an den Zustand angleichen (Song wechseln, abspielen/pausieren) */
  const sync = () => {
    const p = player.current
    const st = getPlayer()
    const it = currentItem(st)
    if (!p || !ready.current || !it) return
    if (it.videoId !== loadedId.current) {
      loadedId.current = it.videoId
      switchedAt.current = Date.now()
      if (st.playing) p.loadVideoById(it.videoId)
      else p.cueVideoById(it.videoId)
    } else if (st.playing) p.playVideo()
    else p.pauseVideo()
  }

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const box = host.current
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !box) return
        const el = document.createElement('div')
        box.appendChild(el)
        player.current = new YT.Player(el, {
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: location.origin },
          events: {
            onReady: () => {
              ready.current = true
              sync()
            },
            onStateChange: (e: YTEvent) => {
              if (e.data === PLAYING) {
                errors.current = 0
                setErr('')
                setPlaying(true)
              } else if (e.data === PAUSED) {
                if (Date.now() - switchedAt.current > 1500) setPlaying(false)
              }
              else if (e.data === ENDED) {
                if (getPlayer().repeat === 'one') {
                  e.target.seekTo(0, true)
                  e.target.playVideo()
                } else next()
              }
            },
            // z. B. 101/150 = darf nicht eingebettet werden → überspringen
            onError: () => {
              errors.current++
              if (errors.current >= getPlayer().queue.length) {
                setErr('Diese Videos lassen sich hier leider nicht abspielen.')
                setPlaying(false)
              } else {
                setErr('Ein Video ließ sich nicht abspielen – weiter zum nächsten.')
                next()
              }
            },
          },
        })
      })
      .catch(() => setErr('YouTube ist gerade nicht erreichbar.'))
    return () => {
      cancelled = true
      player.current?.destroy()
      player.current = null
      ready.current = false
      loadedId.current = null
      if (box) box.innerHTML = ''
    }
  }, [active])

  // bei jedem Songwechsel und Play/Pause angleichen
  useEffect(sync, [item?.videoId, s.playing, s.pos, s.queue])

  if (!active) return null

  const btn = 'grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg hover:bg-rose-100 disabled:opacity-30 dark:hover:bg-white/10'
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 border-t border-rose-100 bg-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur sm:bottom-0 dark:border-white/10 dark:bg-[#1a1220]/95">
      <div className={cx('mx-auto flex max-w-6xl gap-3 px-3 py-2 sm:px-6', s.expanded ? 'flex-col sm:flex-row sm:items-end' : 'items-center')}>
        <div
          ref={host}
          className={cx('aspect-video shrink-0 overflow-hidden rounded-lg bg-black [&>iframe]:h-full [&>iframe]:w-full', s.expanded ? 'w-full sm:w-96' : 'w-24 sm:w-32')}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{item?.title ?? '…'}</div>
            <div className="truncate text-xs text-stone-500 dark:text-rose-100/60">
              {[item?.artist, item?.dramaTitle].filter(Boolean).join(' · ')}
              {s.queue.length > 1 && (
                <span className="ml-1 opacity-70">
                  ({s.pos + 1}/{s.order.length}
                  {s.label ? ` · ${s.label}` : ''})
                </span>
              )}
            </div>
            {err && <div className="truncate text-xs text-red-600">{err}</div>}
          </div>
          <div className="flex shrink-0 items-center">
            <button className={cx(btn, 'hidden sm:grid', s.shuffle && 'text-pink-600')} onClick={() => setShuffle(!s.shuffle)} title={s.shuffle ? 'Zufall aus' : 'Zufall an'} disabled={s.queue.length < 2}>
              🔀
            </button>
            <button className={btn} onClick={prev} disabled={s.pos === 0} title="Zurück">
              ⏮
            </button>
            <button className={cx(btn, 'h-11 w-11 bg-pink-600 text-white hover:bg-pink-700 dark:hover:bg-pink-500')} onClick={togglePlay} title={s.playing ? 'Pause' : 'Abspielen'}>
              {s.playing ? '⏸' : '▶'}
            </button>
            <button className={btn} onClick={() => next()} disabled={s.pos + 1 >= s.order.length && s.repeat !== 'all'} title="Weiter">
              ⏭
            </button>
            <button
              className={cx(btn, 'hidden sm:grid', s.repeat !== 'off' && 'text-pink-600')}
              onClick={cycleRepeat}
              title={s.repeat === 'off' ? 'Wiederholen: aus' : s.repeat === 'all' ? 'Wiederholen: alle' : 'Wiederholen: dieser Song'}
            >
              {s.repeat === 'one' ? '🔂' : '🔁'}
            </button>
            <button className={btn} onClick={toggleExpanded} title={s.expanded ? 'Video verkleinern' : 'Video vergrößern'}>
              {s.expanded ? '▾' : '▴'}
            </button>
            <button className={btn} onClick={stopPlayer} title="Player schließen">
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
