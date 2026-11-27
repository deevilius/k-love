// Tests für die Electron-Hilfsmodule (ohne Electron selbst)
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { htmlToText, compareVersions } = require('./text.cjs')
const { writeProfile, listFiles, isReadableName, FILES, DAILY_KEEP } = require('./profile.cjs')
const { createImageCache, decodeUrl } = require('./imageCache.cjs')

const profile = (n) => JSON.stringify({ app: 'k-love', dramas: Array.from({ length: n }, (_, i) => ({ id: String(i), title: `D${i}` })) })

let dir
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klove-test-'))))
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('htmlToText', () => {
  it('macht aus Release-HTML lesbaren Text', () => {
    expect(htmlToText('<ul><li>Neu &amp; schön</li><li>Fix</li></ul>')).toBe('• Neu & schön\n• Fix')
    expect(htmlToText('<p>A</p><p>B</p>')).toBe('A\nB')
  })
})

describe('compareVersions', () => {
  it('vergleicht numerisch', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('Profildatei', () => {
  it('legt vorher-Kopie und Tageskopie an', () => {
    writeProfile(dir, profile(3), 'profile', false, new Date(2026, 0, 1))
    writeProfile(dir, profile(4), 'profile', false, new Date(2026, 0, 1))
    const kinds = listFiles(dir).map((f) => f.kind)
    expect(kinds).toEqual(expect.arrayContaining(['profile', 'previous', 'daily']))
    expect(listFiles(dir).find((f) => f.kind === 'daily')?.dramas).toBe(3)
  })

  it('behält nur die letzten Tageskopien', () => {
    for (let d = 1; d <= DAILY_KEEP + 3; d++) writeProfile(dir, profile(d), 'profile', false, new Date(2026, 0, d))
    expect(listFiles(dir).filter((f) => f.kind === 'daily')).toHaveLength(DAILY_KEEP)
  })

  it('ersetzt ein volles Profil nicht durch ein leeres', () => {
    writeProfile(dir, profile(3), 'profile', false)
    expect(writeProfile(dir, profile(0), 'profile', false).skipped).toBe(true)
  })

  it('sichert den alten Stand, wenn mehr als die Hälfte der Dramen wegfällt', () => {
    writeProfile(dir, profile(10), 'profile', false)
    writeProfile(dir, profile(3), 'profile', false)
    expect(listFiles(dir).find((f) => f.kind === 'pre-drop')?.dramas).toBe(10)
  })

  it('lässt nur bekannte Dateien lesen', () => {
    expect(isReadableName(FILES.profile)).toBe(true)
    expect(isReadableName('Verlauf/k-love-profil-2026-01-01.json')).toBe(true)
    expect(isReadableName('../geheim.json')).toBe(false)
    expect(isReadableName('Verlauf/../../x.json')).toBe(false)
  })
})

describe('Poster-Zwischenspeicher', () => {
  const enc = (u) => `klove-img://cache/${Buffer.from(u).toString('base64url')}`

  it('akzeptiert nur https-Adressen', () => {
    expect(decodeUrl(enc('https://static.tvmaze.com/a.jpg'))).toBe('https://static.tvmaze.com/a.jpg')
    expect(decodeUrl(enc('file:///C:/Windows/win.ini'))).toBeNull()
    expect(decodeUrl('klove-img://anders/abc')).toBeNull()
  })

  it('lädt ein Bild einmal und danach von der Festplatte', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls++
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    }
    const cache = createImageCache(dir, fetchFn)
    const req = { url: enc('https://example.org/p.jpg') }
    expect((await cache.handle(req)).status).toBe(200)
    const res = await cache.handle(req)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(calls).toBe(1)
  })

  it('speichert keine Nicht-Bilder', async () => {
    const cache = createImageCache(dir, async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    expect((await cache.handle({ url: enc('https://example.org/x') })).status).toBe(502)
    expect(fs.readdirSync(dir)).toEqual([])
  })
})
