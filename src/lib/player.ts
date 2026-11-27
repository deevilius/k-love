/**
 * Globaler Musik-Player (Warteschlange) – der Mini-Player unten in der App spielt daraus ab
 * und läuft beim Seitenwechsel weiter. Nur YouTube-Videos.
 */
import { useSyncExternalStore } from 'react'
import { stopIntro } from './lofi'
import { youtubeVideoId } from './music'
import type { Song } from '../types'

export interface QueueItem {
  songId: string
  videoId: string
  title: string
  artist?: string
  dramaTitle?: string
}

export type Repeat = 'off' | 'all' | 'one'

export interface PlayerState {
  queue: QueueItem[]
  /** Abspielreihenfolge (Indizes in queue) – bei Zufall gemischt */
  order: number[]
  pos: number
  playing: boolean
  shuffle: boolean
  repeat: Repeat
  expanded: boolean
  /** z. B. Name der Playlist */
  label?: string
}

let state: PlayerState = { queue: [], order: [], pos: 0, playing: false, shuffle: false, repeat: 'off', expanded: false }
const listeners = new Set<() => void>()
const set = (patch: Partial<PlayerState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export const getPlayer = () => state
export const usePlayer = () => useSyncExternalStore(subscribe, getPlayer)
export const currentItem = (s: PlayerState = state): QueueItem | undefined => s.queue[s.order[s.pos]]

/** Song → Eintrag für die Warteschlange (null, wenn es kein einzelnes YouTube-Video ist) */
export function toQueueItem(song: Song, dramaTitle?: string): QueueItem | null {
  if (song.source !== 'youtube') return null
  const videoId = youtubeVideoId(song.url)
  return videoId ? { songId: song.id, videoId, title: song.title, artist: song.artist, dramaTitle } : null
}

function shuffled(n: number, first?: number) {
  const rest = [...Array(n).keys()].filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return first === undefined ? rest : [first, ...rest]
}

/** Spielt eine Liste ab, beginnend bei start (Index in items) */
export function playQueue(items: QueueItem[], start = 0, opts: { shuffle?: boolean; label?: string } = {}) {
  if (!items.length) return
  stopIntro()
  const shuffle = opts.shuffle ?? state.shuffle
  const order = shuffle ? shuffled(items.length, opts.shuffle ? undefined : start) : [...items.keys()]
  set({ queue: items, order, pos: shuffle ? 0 : start, playing: true, shuffle, label: opts.label })
}

export const playItem = (item: QueueItem) => playQueue([item], 0, { shuffle: false, label: undefined })

/** Nächster Song; am Ende von vorn (bei „alle wiederholen“), sonst anhalten */
export function next() {
  if (!state.queue.length) return
  if (state.pos + 1 < state.order.length) return set({ pos: state.pos + 1, playing: true })
  if (state.repeat === 'all') return set({ pos: 0, order: state.shuffle ? shuffled(state.queue.length) : state.order, playing: true })
  set({ playing: false })
}

export function prev() {
  if (state.pos > 0) set({ pos: state.pos - 1, playing: true })
}

export const setPlaying = (playing: boolean) => state.playing !== playing && set({ playing })
export const togglePlay = () => set({ playing: !state.playing })

export function setShuffle(on: boolean) {
  const cur = state.order[state.pos]
  if (on) set({ shuffle: true, order: shuffled(state.queue.length, cur), pos: 0 })
  else set({ shuffle: false, order: [...state.queue.keys()], pos: cur ?? 0 })
}

export const cycleRepeat = () => set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })
export const toggleExpanded = () => set({ expanded: !state.expanded })
export const jumpTo = (pos: number) => pos >= 0 && pos < state.order.length && set({ pos, playing: true })
export const stopPlayer = () => set({ queue: [], order: [], pos: 0, playing: false, label: undefined })
