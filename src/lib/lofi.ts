import { useSyncExternalStore } from 'react'

/**
 * Kurzer Lofi-Song zum App-Start – komplett per Web Audio erzeugt (keine Datei, keine Lizenz).
 * Weiche Rhodes-Akkorde, Melodie in koreanischer Pentatonik und ein geswingter Beat.
 */

const KEY = 'klove.introMusic'
export const introEnabled = () => localStorage.getItem(KEY) !== 'off'
export function setIntroEnabled(on: boolean) {
  localStorage.setItem(KEY, on ? 'on' : 'off')
  emit()
}

/** Header-Knopf: stummschalten stoppt die Musik und merkt sich das, entstummen spielt sie (wieder) ab */
export function toggleIntroMute() {
  if (introEnabled()) {
    setIntroEnabled(false)
    stopIntro()
  } else {
    setIntroEnabled(true)
    playIntro()
  }
}

const BPM = 72
const BEAT = 60 / BPM
const BAR = BEAT * 4
const CYCLES = 3 // 3 × 4 Takte ≈ 40 s
const DUR = CYCLES * 4 * BAR
const VOLUME = 0.12

// Fmaj7 – Em7 – Dm7 – Cmaj7 (MIDI-Noten)
const CHORDS = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
]

// Pentatonik C–D–F–G–A: [Beat im 4-Takt-Zyklus, MIDI-Note, Länge in Beats]
const MOTIF: [number, number, number][] = [
  [0, 69, 1], [1, 67, 0.5], [1.5, 65, 1.5], [3, 62, 1],
  [4.5, 65, 0.5], [5, 67, 1], [6, 69, 2],
  [8, 72, 1], [9, 69, 0.5], [9.5, 67, 1.5], [11, 65, 1],
  [12, 62, 1], [13, 65, 0.5], [13.5, 62, 0.5], [14, 60, 2],
]
const ENDING: [number, number, number][] = [
  [12, 67, 1], [13, 65, 0.5], [13.5, 62, 0.5], [14, 60, 2],
]

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)
/** Achtel-Offbeats leicht verzögern (Swing) */
const swing = (beat: number) => (beat % 1 === 0.5 ? beat + 0.08 : beat)

// ---------- Zustand + Abo für die UI ----------

type Playing = { ctx: AudioContext; master: GainNode; unlock: () => void }
let current: Playing | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export const isIntroPlaying = () => current !== null
export const useIntroPlaying = () => useSyncExternalStore(subscribe, isIntroPlaying)
export const useIntroEnabled = () => useSyncExternalStore(subscribe, introEnabled)

let autoStarted = false
/** Einmal pro App-Start (StrictMode ruft Effekte doppelt auf) */
export function playIntroOnStartup() {
  if (autoStarted || !introEnabled()) return
  autoStarted = true
  playIntro()
}

export function stopIntro(immediate = false) {
  const p = current
  if (!p) return
  current = null
  emit()
  p.unlock()
  if (immediate || p.ctx.state !== 'running') {
    void p.ctx.close()
    return
  }
  const now = p.ctx.currentTime
  p.master.gain.cancelScheduledValues(now)
  p.master.gain.setValueAtTime(p.master.gain.value, now)
  p.master.gain.linearRampToValueAtTime(0, now + 0.8)
  setTimeout(() => void p.ctx.close(), 900)
}

export function playIntro() {
  stopIntro(true)
  let ctx: AudioContext
  try {
    ctx = new AudioContext()
  } catch {
    return
  }

  // Signalweg: Instrumente → Lofi-Tiefpass → Master → Lautsprecher
  const master = ctx.createGain()
  master.connect(ctx.destination)
  const muffle = ctx.createBiquadFilter()
  muffle.type = 'lowpass'
  muffle.frequency.value = 2200
  muffle.Q.value = 0.7
  muffle.connect(master)

  // leichtes Leiern wie bei Kassette/Vinyl
  const wobble = ctx.createOscillator()
  wobble.frequency.value = 0.45
  const wobbleDepth = ctx.createGain()
  wobbleDepth.gain.value = 7 // Cent
  wobble.connect(wobbleDepth)

  // Echo für die Melodie
  const delay = ctx.createDelay(1)
  delay.delayTime.value = BEAT * 0.75
  const feedback = ctx.createGain()
  feedback.gain.value = 0.3
  delay.connect(feedback).connect(delay)
  delay.connect(muffle)

  const noise = noiseBuffer(ctx)
  const t0 = ctx.currentTime + 0.15
  const end = t0 + DUR

  master.gain.setValueAtTime(0, t0)
  master.gain.linearRampToValueAtTime(VOLUME, t0 + 2)
  master.gain.setValueAtTime(VOLUME, end - 4)
  master.gain.linearRampToValueAtTime(0, end)
  wobble.start(t0)
  wobble.stop(end)

  const tone = (freq: number, type: OscillatorType, at: number, len: number, gain: number, dest: AudioNode, attack = 0.02) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    wobbleDepth.connect(o.detune)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + attack)
    g.gain.exponentialRampToValueAtTime(gain * 0.4, at + Math.min(len, 0.6))
    g.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.4)
    o.connect(g).connect(dest)
    o.start(at)
    o.stop(at + len + 0.5)
  }

  const hit = (at: number, filter: BiquadFilterType, freq: number, gain: number, decay: number) => {
    const s = ctx.createBufferSource()
    s.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    s.connect(f).connect(g).connect(muffle)
    s.start(at, Math.random() * 1.5)
    s.stop(at + decay + 0.05)
  }

  const kick = (at: number) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(120, at)
    o.frequency.exponentialRampToValueAtTime(45, at + 0.15)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.8, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
    o.connect(g).connect(muffle)
    o.start(at)
    o.stop(at + 0.4)
  }

  for (let bar = 0; bar < CYCLES * 4; bar++) {
    const tb = t0 + bar * BAR
    const chord = CHORDS[bar % 4]
    // Rhodes-artige Akkorde + Bass
    for (const n of chord) {
      tone(hz(n), 'sine', tb, BAR - 0.1, 0.07, muffle, 0.03)
      tone(hz(n + 12), 'triangle', tb, BAR * 0.5, 0.012, muffle, 0.03)
    }
    tone(hz(chord[0] - 12), 'sine', tb, BEAT * 2.5, 0.16, muffle)
    // Beat ab dem zweiten Takt
    if (bar >= 1) {
      kick(tb)
      kick(tb + swing(2.5) * BEAT)
      hit(tb + BEAT, 'bandpass', 1800, 0.25, 0.18)
      hit(tb + 3 * BEAT, 'bandpass', 1800, 0.25, 0.18)
      for (let e = 0; e < 8; e++) hit(tb + swing(e / 2) * BEAT, 'highpass', 7000, e % 2 ? 0.04 : 0.07, 0.05)
    }
  }

  // Melodie in den Zyklen 2 und 3, am Schluss aufgelöst
  for (let c = 1; c < CYCLES; c++) {
    const tc = t0 + c * 4 * BAR
    const notes = c === CYCLES - 1 ? [...MOTIF.filter(([b]) => b < 12), ...ENDING] : MOTIF
    for (const [b, m, len] of notes) {
      const at = tc + swing(b) * BEAT
      tone(hz(m), 'triangle', at, len * BEAT, 0.09, muffle, 0.01)
      tone(hz(m), 'sine', at, len * BEAT, 0.04, delay, 0.01)
    }
  }

  // Ende erkennen (funktioniert auch, wenn der Kontext erst später freigegeben wird)
  wobble.onended = () => {
    if (current?.ctx === ctx) stopIntro(true)
  }

  // Falls Autoplay blockiert ist: beim ersten Klick/Tastendruck starten
  const resume = () => void ctx.resume()
  const unlock = () => {
    window.removeEventListener('pointerdown', resume, true)
    window.removeEventListener('keydown', resume, true)
  }
  if (ctx.state === 'suspended') {
    window.addEventListener('pointerdown', resume, { capture: true, once: true })
    window.addEventListener('keydown', resume, { capture: true, once: true })
  }

  current = { ctx, master, unlock }
  emit()
}

function noiseBuffer(ctx: AudioContext) {
  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}
