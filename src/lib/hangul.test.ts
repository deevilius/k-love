import { describe, expect, it } from 'vitest'
import {
  DRAMA_WORDS,
  FAMOUS_TITLES,
  LESSONS,
  LETTERS,
  PASS_SCORE,
  ROUND_SIZE,
  compose,
  decompose,
  emptyProgress,
  finishRound,
  isUnlocked,
  makeRound,
  recordAnswer,
  romanizeSyllable,
  streak,
  titleCards,
} from './hangul'

/** Reproduzierbarer Zufall */
function seeded(seed = 1) {
  // mulberry32
  let a = seed * 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!

describe('Silbenblöcke', () => {
  it('setzt zusammen und zerlegt', () => {
    expect(compose('ㄱ', 'ㅏ')).toBe('가')
    expect(compose('ㅎ', 'ㅏ', 'ㄴ')).toBe('한')
    expect(compose('ㄱ', 'ㅡ', 'ㄹ')).toBe('글')
    expect(decompose('뷁')).toEqual({ initial: 'ㅂ', vowel: 'ㅞ', final: 'ㄺ' })
    expect(decompose('a')).toBeNull()
  })

  it('romanisiert einzelne Silben', () => {
    expect(romanizeSyllable('가')).toBe('ga')
    expect(romanizeSyllable('한')).toBe('han')
    expect(romanizeSyllable('글')).toBe('geul')
    expect(romanizeSyllable('응')).toBe('eung')
    expect(romanizeSyllable('밥')).toBe('bap')
    expect(romanizeSyllable('리')).toBe('ri')
    expect(romanizeSyllable('짜')).toBe('jja')
  })
})

describe('Daten', () => {
  it('jedes Zeichen kommt genau einmal vor und steckt in einer Stufe', () => {
    const chars = LETTERS.map((l) => l.ch)
    expect(new Set(chars).size).toBe(chars.length)
    const inLessons = LESSONS.flatMap((l) => (l.kind === 'letters' ? [...l.letters] : []))
    expect(inLessons.sort()).toEqual([...chars].sort())
  })

  it('Umschriften und Wörter sind eindeutig', () => {
    expect(new Set(LETTERS.map((l) => l.rom)).size).toBe(LETTERS.length)
    expect(new Set(DRAMA_WORDS.map((w) => w.rom)).size).toBe(DRAMA_WORDS.length)
    expect(new Set(FAMOUS_TITLES.map((t) => t.title)).size).toBe(FAMOUS_TITLES.length)
  })
})

describe('makeRound', () => {
  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: zehn gültige Fragen', (_, l) => {
    const qs = makeRound(l, emptyProgress(), seeded(7))
    expect(qs).toHaveLength(ROUND_SIZE)
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options).toContain(q.answer)
    }
    // nie zweimal dieselbe Frage direkt hintereinander
    for (let i = 1; i < qs.length; i++) expect(qs[i].itemId).not.toBe(qs[i - 1].itemId)
  })

  it('Silben-Ablenker unterscheiden sich in genau einem Bestandteil', () => {
    for (const q of makeRound(lesson('batchim'), emptyProgress(), seeded(3))) {
      expect(romanizeSyllable(q.prompt)).toBe(q.answer)
      expect(decompose(q.prompt)!.final).not.toBe('')
    }
  })

  it('schwache Zeichen kommen öfter dran', () => {
    const l = lesson('vokale1')
    let p = emptyProgress()
    for (const c of 'ㅏㅓㅗㅜㅡ') for (let i = 0; i < 5; i++) p = recordAnswer(p, c, true)
    const counts = new Map<string, number>()
    for (let s = 1; s <= 30; s++) for (const q of makeRound(l, p, seeded(s))) counts.set(q.itemId, (counts.get(q.itemId) ?? 0) + 1)
    expect(counts.get('ㅣ')!).toBeGreaterThan(counts.get('ㅏ')! * 2)
  })

  it('Titel-Stufe nimmt eigene Dramen mit koreanischem Titel bevorzugt', () => {
    const library = [
      { title: 'Mein Lieblingsdrama', originalTitle: '나의 드라마' },
      { title: 'Ohne Originaltitel' },
      { title: 'Goblin', originalTitle: '도깨비' },
    ]
    const { own, famous } = titleCards(library)
    expect(own.map((c) => c.title)).toEqual(['Mein Lieblingsdrama', 'Goblin'])
    expect(famous.some((f) => f.ko === '도깨비')).toBe(false)
    const ids = makeRound(lesson('titel'), emptyProgress(), seeded(5), library).map((q) => q.itemId)
    expect(ids).toContain('t:나의 드라마')
    expect(ids).toContain('t:도깨비')
  })
})

describe('Fortschritt', () => {
  it('richtig steigt bis 5, falsch setzt zurück', () => {
    let p = emptyProgress()
    for (let i = 0; i < 7; i++) p = recordAnswer(p, 'ㄱ', true)
    expect(p.items['ㄱ']).toBe(5)
    expect(recordAnswer(p, 'ㄱ', false).items['ㄱ']).toBe(0)
  })

  it('schaltet Stufen ab 8 von 10 frei, behält das beste Ergebnis', () => {
    let p = emptyProgress()
    expect(isUnlocked(lesson('vokale1'), p)).toBe(true)
    expect(isUnlocked(lesson('konsonanten1'), p)).toBe(false)
    p = finishRound(p, 'vokale1', PASS_SCORE - 1, '2026-11-27')
    expect(isUnlocked(lesson('konsonanten1'), p)).toBe(false)
    p = finishRound(p, 'vokale1', PASS_SCORE, '2026-11-27')
    p = finishRound(p, 'vokale1', 3, '2026-11-27')
    expect(p.best.vokale1).toBe(PASS_SCORE)
    expect(isUnlocked(lesson('konsonanten1'), p)).toBe(true)
    // Wörter, Titel und Doppelkonsonanten hängen an den Schlusskonsonanten
    expect(isUnlocked(lesson('titel'), { ...p, best: { ...p.best, batchim: 9 } })).toBe(true)
    expect(isUnlocked(lesson('titel'), { ...p, unlockAll: true })).toBe(true)
    expect(p.days).toEqual(['2026-11-27'])
  })

  it('zählt Tage in Folge – heute darf noch fehlen', () => {
    expect(streak(['2026-11-25', '2026-11-26', '2026-11-27'], '2026-11-27')).toBe(3)
    expect(streak(['2026-11-25', '2026-11-26'], '2026-11-27')).toBe(2)
    expect(streak(['2026-11-24', '2026-11-26'], '2026-11-27')).toBe(1)
    expect(streak(['2026-11-25'], '2026-11-27')).toBe(0)
    // über den Monatswechsel
    expect(streak(['2026-11-30', '2026-12-01'], '2026-12-01')).toBe(2)
  })
})
