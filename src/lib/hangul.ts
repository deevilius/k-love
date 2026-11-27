/**
 * Hangul-Trainer: Zeichen, Lernstufen, Fragen und Fortschritt.
 * Alles hier ist rein (ohne Datenbank), damit es sich testen lässt.
 */

import { localDay } from './util'

// ---------- Silbenblöcke zerlegen und zusammensetzen (Unicode-Arithmetik) ----------

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const VOWELS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']

/** Revidierte Romanisierung, Anlaut / Vokal / Auslaut (einzeln gesprochene Silbe) */
const ROM_INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const ROM_VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const ROM_FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't']

const BASE = 0xac00

export function compose(initial: string, vowel: string, final = ''): string {
  const l = INITIALS.indexOf(initial)
  const v = VOWELS.indexOf(vowel)
  const t = FINALS.indexOf(final)
  if (l < 0 || v < 0 || t < 0) throw new Error(`Kein gültiger Silbenblock: ${initial}${vowel}${final}`)
  return String.fromCharCode(BASE + (l * 21 + v) * 28 + t)
}

export function decompose(syllable: string): { initial: string; vowel: string; final: string } | null {
  const code = syllable.charCodeAt(0) - BASE
  if (syllable.length !== 1 || code < 0 || code > 11171) return null
  return { initial: INITIALS[Math.floor(code / 588)], vowel: VOWELS[Math.floor((code % 588) / 28)], final: FINALS[code % 28] }
}

/** Romanisierung einer einzeln gesprochenen Silbe, z. B. 간 → gan, 응 → eung */
export function romanizeSyllable(syllable: string): string {
  const p = decompose(syllable)
  if (!p) return syllable
  return ROM_INITIAL[INITIALS.indexOf(p.initial)] + ROM_VOWEL[VOWELS.indexOf(p.vowel)] + ROM_FINAL[FINALS.indexOf(p.final)]
}

export const hasHangul = (s: string | undefined) => !!s && /[가-힣]/.test(s)

// ---------- Die Zeichen ----------

export interface Letter {
  ch: string
  /** Romanisierung, wie sie in den Antworten steht */
  rom: string
  /** Wird für die Aussprache vorgelesen (ein einzelnes Zeichen liest die Sprachausgabe als Namen) */
  say: string
  hint: string
  kind: 'vowel' | 'consonant'
}

const L = (ch: string, rom: string, say: string, hint: string, kind: Letter['kind']): Letter => ({ ch, rom, say, hint, kind })

export const LETTERS: Letter[] = [
  // Grundvokale
  L('ㅏ', 'a', '아', 'a wie in „Mama“ – der Strich zeigt nach rechts', 'vowel'),
  L('ㅓ', 'eo', '어', 'offenes o wie in „Post“ – der Strich zeigt nach links', 'vowel'),
  L('ㅗ', 'o', '오', 'geschlossenes o wie in „Ofen“ – der Strich zeigt nach oben', 'vowel'),
  L('ㅜ', 'u', '우', 'u wie in „Hut“ – der Strich zeigt nach unten', 'vowel'),
  L('ㅡ', 'eu', '으', 'ein u mit breit gezogenen Lippen, wie beim Lächeln', 'vowel'),
  L('ㅣ', 'i', '이', 'i wie in „Bibel“ – ein aufrechter Strich', 'vowel'),
  // Erste Konsonanten
  L('ㄱ', 'g / k', '가', 'zwischen g und k – sieht aus wie ein Haken', 'consonant'),
  L('ㄴ', 'n', '나', 'n wie in „Nase“ – die Zunge liegt hinter den Zähnen', 'consonant'),
  L('ㄷ', 'd / t', '다', 'zwischen d und t – ㄴ mit einem Dach', 'consonant'),
  L('ㄹ', 'r / l', '라', 'zwischen r und l – am Silbenende ein l', 'consonant'),
  L('ㅁ', 'm', '마', 'm – ein Viereck wie ein geschlossener Mund', 'consonant'),
  L('ㅂ', 'b / p', '바', 'zwischen b und p – sieht aus wie ein kleiner Eimer', 'consonant'),
  L('ㅅ', 's', '사', 's – wie ein Zelt; vor ㅣ eher „sch“', 'consonant'),
  L('ㅇ', 'stumm / ng', '아', 'am Silbenanfang stumm, am Ende „ng“ wie in „lang“', 'consonant'),
  // Behauchte Konsonanten
  L('ㅈ', 'j', '자', 'ein weiches „dsch“ wie in „Dschungel“', 'consonant'),
  L('ㅊ', 'ch', '차', 'ㅈ mit Strich obendrauf – ein behauchtes „tsch“', 'consonant'),
  L('ㅋ', 'k', '카', 'ㄱ mit Extrastrich – ein k mit Hauch', 'consonant'),
  L('ㅌ', 't', '타', 'ㄷ mit Extrastrich – ein t mit Hauch', 'consonant'),
  L('ㅍ', 'p', '파', 'ein p mit Hauch', 'consonant'),
  L('ㅎ', 'h', '하', 'h wie in „Haus“ – ein Männchen mit Hut', 'consonant'),
  // Vokale mit j
  L('ㅑ', 'ya', '야', 'ㅏ mit zweitem Strich – ein j davor: „ja“', 'vowel'),
  L('ㅕ', 'yeo', '여', 'ㅓ mit zweitem Strich – „jo“ mit offenem o', 'vowel'),
  L('ㅛ', 'yo', '요', 'ㅗ mit zweitem Strich – „jo“', 'vowel'),
  L('ㅠ', 'yu', '유', 'ㅜ mit zweitem Strich – „ju“', 'vowel'),
  L('ㅐ', 'ae', '애', 'ä wie in „Bär“', 'vowel'),
  L('ㅔ', 'e', '에', 'e wie in „Bett“ – klingt heute fast wie ㅐ', 'vowel'),
  // Doppelkonsonanten
  L('ㄲ', 'kk', '까', 'doppeltes ㄱ – ein hartes, angespanntes k ohne Hauch', 'consonant'),
  L('ㄸ', 'tt', '따', 'doppeltes ㄷ – ein hartes, angespanntes t ohne Hauch', 'consonant'),
  L('ㅃ', 'pp', '빠', 'doppeltes ㅂ – ein hartes, angespanntes p ohne Hauch (wie in 오빠)', 'consonant'),
  L('ㅆ', 'ss', '싸', 'doppeltes ㅅ – ein scharfes, gespanntes s', 'consonant'),
  L('ㅉ', 'jj', '짜', 'doppeltes ㅈ – ein hartes „tz“ (wie in 진짜)', 'consonant'),
  // Zusammengesetzte Vokale
  L('ㅒ', 'yae', '얘', 'ㅐ mit zweitem Strich – „jä“', 'vowel'),
  L('ㅖ', 'ye', '예', 'ㅔ mit zweitem Strich – „je“', 'vowel'),
  L('ㅘ', 'wa', '와', 'ㅗ + ㅏ – „wa“', 'vowel'),
  L('ㅙ', 'wae', '왜', 'ㅗ + ㅐ – „wä“ (왜? = warum?)', 'vowel'),
  L('ㅚ', 'oe', '외', 'ㅗ + ㅣ – klingt heute wie „we“', 'vowel'),
  L('ㅝ', 'wo', '워', 'ㅜ + ㅓ – „wo“ mit offenem o', 'vowel'),
  L('ㅞ', 'we', '웨', 'ㅜ + ㅔ – „we“', 'vowel'),
  L('ㅟ', 'wi', '위', 'ㅜ + ㅣ – „wi“', 'vowel'),
  L('ㅢ', 'ui', '의', 'ㅡ + ㅣ – beide schnell hintereinander', 'vowel'),
]

export const letter = (ch: string) => LETTERS.find((l) => l.ch === ch)

// ---------- Wörter und Titel ----------

export interface Word {
  ko: string
  rom: string
  de: string
}

/** Wörter, die man aus Dramen kennt */
export const DRAMA_WORDS: Word[] = [
  { ko: '사랑해', rom: 'saranghae', de: 'Ich liebe dich' },
  { ko: '대박', rom: 'daebak', de: 'Wahnsinn! Der Hammer!' },
  { ko: '괜찮아', rom: 'gwaenchana', de: 'Alles okay / Ist schon gut' },
  { ko: '오빠', rom: 'oppa', de: 'älterer Bruder – oder Freund (sagt eine Frau)' },
  { ko: '언니', rom: 'eonni', de: 'ältere Schwester (sagt eine Frau)' },
  { ko: '누나', rom: 'nuna', de: 'ältere Schwester (sagt ein Mann)' },
  { ko: '형', rom: 'hyeong', de: 'älterer Bruder (sagt ein Mann)' },
  { ko: '진짜', rom: 'jinjja', de: 'Echt? / Wirklich!' },
  { ko: '아이고', rom: 'aigo', de: 'Ach je!' },
  { ko: '화이팅', rom: 'hwaiting', de: 'Du schaffst das!' },
  { ko: '미안해', rom: 'mianhae', de: 'Es tut mir leid' },
  { ko: '고마워', rom: 'gomawo', de: 'Danke' },
  { ko: '안녕', rom: 'annyeong', de: 'Hallo / Tschüss' },
  { ko: '미쳤어', rom: 'michyeosseo', de: 'Bist du verrückt?' },
  { ko: '뭐야', rom: 'mwoya', de: 'Was soll das?' },
  { ko: '가지 마', rom: 'gaji ma', de: 'Geh nicht!' },
  { ko: '보고 싶어', rom: 'bogo sipeo', de: 'Ich vermisse dich' },
  { ko: '잘 자', rom: 'jal ja', de: 'Schlaf gut' },
  { ko: '선배', rom: 'seonbae', de: 'älterer Kollege / Kommilitone' },
  { ko: '회장님', rom: 'hoejangnim', de: 'Herr Vorsitzender (der Konzernchef)' },
  { ko: '엄마', rom: 'eomma', de: 'Mama' },
  { ko: '아빠', rom: 'appa', de: 'Papa' },
  { ko: '아저씨', rom: 'ajeossi', de: 'Onkel / älterer Herr' },
  { ko: '아줌마', rom: 'ajumma', de: 'Tante / ältere Frau' },
  { ko: '소주', rom: 'soju', de: 'Soju' },
  { ko: '라면', rom: 'ramyeon', de: 'Instantnudeln' },
  { ko: '치맥', rom: 'chimaek', de: 'Brathähnchen und Bier' },
  { ko: '우리', rom: 'uri', de: 'wir / unser' },
  { ko: '약속', rom: 'yaksok', de: 'Versprechen' },
  { ko: '첫사랑', rom: 'cheotsarang', de: 'erste Liebe' },
  { ko: '운명', rom: 'unmyeong', de: 'Schicksal' },
  { ko: '비밀', rom: 'bimil', de: 'Geheimnis' },
  { ko: '질투', rom: 'jiltu', de: 'Eifersucht' },
  { ko: '반말', rom: 'banmal', de: 'lockere Du-Sprache' },
  { ko: '귀여워', rom: 'gwiyeowo', de: 'Süß!' },
  { ko: '헐', rom: 'heol', de: 'Krass! / Oh nein!' },
]

export interface TitleCard {
  ko: string
  title: string
}

/** Bekannte Dramen – für die Titel-Stufe, wenn die eigene Bibliothek zu wenige koreanische Titel hat */
export const FAMOUS_TITLES: TitleCard[] = [
  { ko: '사랑의 불시착', title: 'Crash Landing on You' },
  { ko: '눈물의 여왕', title: 'Queen of Tears' },
  { ko: '도깨비', title: 'Goblin' },
  { ko: '이상한 변호사 우영우', title: 'Extraordinary Attorney Woo' },
  { ko: '이태원 클라쓰', title: 'Itaewon Class' },
  { ko: '사이코지만 괜찮아', title: "It's Okay to Not Be Okay" },
  { ko: '갯마을 차차차', title: 'Hometown Cha-Cha-Cha' },
  { ko: '태양의 후예', title: 'Descendants of the Sun' },
  { ko: '사내맞선', title: 'Business Proposal' },
  { ko: '선재 업고 튀어', title: 'Lovely Runner' },
  { ko: '응답하라 1988', title: 'Reply 1988' },
  { ko: '슬기로운 의사생활', title: 'Hospital Playlist' },
  { ko: '꽃보다 남자', title: 'Boys Over Flowers' },
  { ko: '김비서가 왜 그럴까', title: "What's Wrong with Secretary Kim" },
  { ko: '별에서 온 그대', title: 'My Love from the Star' },
  { ko: '호텔 델루나', title: 'Hotel Del Luna' },
  { ko: '스물다섯 스물하나', title: 'Twenty-Five Twenty-One' },
  { ko: '나의 아저씨', title: 'My Mister' },
  { ko: '동백꽃 필 무렵', title: 'When the Camellia Blooms' },
  { ko: '오징어 게임', title: 'Squid Game' },
]

const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')

/** Titel aus der Bibliothek (mit koreanischem Originaltitel) und bekannte Dramen, die dort fehlen */
export function titleCards(library: { title: string; originalTitle?: string }[]): { own: TitleCard[]; famous: TitleCard[] } {
  const own: TitleCard[] = []
  for (const d of library) {
    if (!hasHangul(d.originalTitle) || !d.title.trim()) continue
    const card = { ko: d.originalTitle!.trim(), title: d.title.trim() }
    if (!own.some((o) => o.ko === card.ko || o.title === card.title)) own.push(card)
  }
  const seen = new Set(own.flatMap((c) => [normTitle(c.ko), normTitle(c.title)]))
  return { own, famous: FAMOUS_TITLES.filter((f) => !seen.has(normTitle(f.ko)) && !seen.has(normTitle(f.title))) }
}

// ---------- Lernstufen ----------

export type Lesson =
  | { id: string; title: string; kind: 'letters'; letters: string; requires?: string }
  | { id: string; title: string; kind: 'syllables'; initials: string; vowels: string; finals: string[]; requires?: string }
  | { id: string; title: string; kind: 'words' | 'titles'; requires?: string }

const BASIC_CONSONANTS = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'

export const LESSONS: Lesson[] = [
  { id: 'vokale1', title: 'Grundvokale', kind: 'letters', letters: 'ㅏㅓㅗㅜㅡㅣ' },
  { id: 'konsonanten1', title: 'Erste Konsonanten', kind: 'letters', letters: 'ㄱㄴㄷㄹㅁㅂㅅㅇ' },
  { id: 'silben1', title: 'Erste Silben', kind: 'syllables', initials: 'ㄱㄴㄷㄹㅁㅂㅅㅇ', vowels: 'ㅏㅓㅗㅜㅡㅣ', finals: [''] },
  { id: 'konsonanten2', title: 'Behauchte Konsonanten', kind: 'letters', letters: 'ㅈㅊㅋㅌㅍㅎ' },
  { id: 'vokale2', title: 'Vokale mit j', kind: 'letters', letters: 'ㅑㅕㅛㅠㅐㅔ' },
  { id: 'batchim', title: 'Schlusskonsonanten', kind: 'syllables', initials: BASIC_CONSONANTS, vowels: 'ㅏㅓㅗㅜㅡㅣㅑㅕㅛㅠㅐㅔ', finals: [...'ㄱㄴㄹㅁㅂㅇ'] },
  { id: 'woerter', title: 'Drama-Wörter', kind: 'words', requires: 'batchim' },
  { id: 'titel', title: 'Drama-Titel', kind: 'titles', requires: 'batchim' },
  { id: 'doppelt', title: 'Doppelkonsonanten', kind: 'letters', letters: 'ㄲㄸㅃㅆㅉ', requires: 'batchim' },
  { id: 'vokale3', title: 'Zusammengesetzte Vokale', kind: 'letters', letters: 'ㅒㅖㅘㅙㅚㅝㅞㅟㅢ', requires: 'doppelt' },
]

export const ROUND_SIZE = 10
/** So viele richtige Antworten in einer Runde schalten die nächste Stufe frei */
export const PASS_SCORE = 8
/** Ab dieser Stufe gilt ein Zeichen als „sicher“ */
export const KNOWN_LEVEL = 3
const MAX_LEVEL = 5

// ---------- Fortschritt ----------

export interface HangulProgress {
  /** Zeichen/Silbe/Wort → Lernstand 0–5 (richtig +1, falsch → 0) */
  items: Record<string, number>
  /** Bestes Rundenergebnis je Stufe */
  best: Record<string, number>
  /** Tage (JJJJ-MM-TT), an denen geübt wurde – die letzten 60 */
  days: string[]
  /** „Ich kann schon etwas“: alle Stufen frei */
  unlockAll?: boolean
}

export const emptyProgress = (): HangulProgress => ({ items: {}, best: {}, days: [] })

export function normalizeProgress(p: Partial<HangulProgress> | undefined): HangulProgress {
  return { items: p?.items ?? {}, best: p?.best ?? {}, days: p?.days ?? [], unlockAll: p?.unlockAll }
}

export function isUnlocked(lesson: Lesson, p: HangulProgress): boolean {
  if (p.unlockAll) return true
  const i = LESSONS.indexOf(lesson)
  const req = lesson.requires ?? LESSONS[i - 1]?.id
  return !req || (p.best[req] ?? 0) >= PASS_SCORE
}

export function recordAnswer(p: HangulProgress, itemId: string, correct: boolean): HangulProgress {
  const level = correct ? Math.min(MAX_LEVEL, (p.items[itemId] ?? 0) + 1) : 0
  return { ...p, items: { ...p.items, [itemId]: level } }
}

export function finishRound(p: HangulProgress, lessonId: string, score: number, day: string): HangulProgress {
  const days = p.days.includes(day) ? p.days : [...p.days, day].sort().slice(-60)
  return { ...p, best: { ...p.best, [lessonId]: Math.max(p.best[lessonId] ?? 0, score) }, days }
}

/** Tage in Folge geübt – zählt bis heute oder gestern (heute darf noch kommen) */
export function streak(days: string[], today: string): number {
  const set = new Set(days)
  const d = new Date(`${today}T12:00:00`)
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  let n = 0
  while (set.has(localDay(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export const knownLetters = (p: HangulProgress) => LETTERS.filter((l) => (p.items[l.ch] ?? 0) >= KNOWN_LEVEL).length

// ---------- Fragen ----------

export interface Question {
  /** Schlüssel für den Lernstand */
  itemId: string
  prompt: string
  /** 'ko': Hangul groß zeigen, 'latin': Umschrift/Titel */
  promptLang: 'ko' | 'latin'
  options: string[]
  optionLang: 'ko' | 'latin'
  answer: string
  /** Wird vorgelesen */
  say?: string
  /** Nach der Antwort: Erklärung */
  explain?: string
}

export type Rng = () => number

const shuffle = <T>(list: T[], rng: Rng): T[] => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Antwort + bis zu drei verschiedene Ablenker, gemischt */
function options(answer: string, pool: string[], rng: Rng, n = 4): string[] {
  const others = shuffle([...new Set(pool.filter((x) => x !== answer))], rng).slice(0, n - 1)
  return shuffle([answer, ...others], rng)
}

/**
 * Zieht Einträge, schwache (niedriger Lernstand) öfter, nie zweimal direkt hintereinander.
 * unique: jeden Eintrag höchstens einmal, solange der Vorrat reicht (für große Listen wie Wörter).
 */
function pickWeighted<T>(items: T[], idOf: (t: T) => string, p: HangulProgress, count: number, rng: Rng, unique = false): T[] {
  const out: T[] = []
  for (let k = 0; k < count && items.length; k++) {
    const prev = out.length ? idOf(out[out.length - 1]) : undefined
    const used = new Set(out.map(idOf))
    let pool = items.length > 1 ? items.filter((t) => idOf(t) !== prev) : items
    if (unique && pool.some((t) => !used.has(idOf(t)))) pool = pool.filter((t) => !used.has(idOf(t)))
    const weights = pool.map((t) => MAX_LEVEL + 1 - Math.min(MAX_LEVEL, p.items[idOf(t)] ?? 0))
    let r = rng() * weights.reduce((a, b) => a + b, 0)
    let i = 0
    while (i < pool.length - 1 && (r -= weights[i]) >= 0) i++
    out.push(pool[i])
  }
  return out
}

/** Zeichen aller Buchstaben-Stufen vor dieser */
function earlierLetters(lesson: Lesson): Letter[] {
  const i = LESSONS.indexOf(lesson)
  const chars = LESSONS.slice(0, i).flatMap((l) => (l.kind === 'letters' ? [...l.letters] : []))
  return chars.map((c) => letter(c)!)
}

function letterQuestion(l: Letter, pool: Letter[], rng: Rng): Question {
  const sameKind = pool.filter((x) => x.kind === l.kind)
  const distract = sameKind.length >= 4 ? sameKind : pool
  if (rng() < 0.35)
    return {
      itemId: l.ch,
      prompt: l.rom,
      promptLang: 'latin',
      options: options(l.ch, distract.map((x) => x.ch), rng),
      optionLang: 'ko',
      answer: l.ch,
      say: l.say,
      explain: l.hint,
    }
  return {
    itemId: l.ch,
    prompt: l.ch,
    promptLang: 'ko',
    options: options(l.rom, distract.map((x) => x.rom), rng),
    optionLang: 'latin',
    answer: l.rom,
    say: l.say,
    explain: l.hint,
  }
}

function syllableQuestion(s: string, lesson: Extract<Lesson, { kind: 'syllables' }>, rng: Rng): Question {
  const p = decompose(s)!
  // Ablenker: jeweils ein Bestandteil anders – so lernt man genau hinzusehen
  const variants = new Set<string>()
  for (const i of lesson.initials) variants.add(compose(i, p.vowel, p.final))
  for (const v of lesson.vowels) variants.add(compose(p.initial, v, p.final))
  for (const f of [...lesson.finals, '']) variants.add(compose(p.initial, p.vowel, f))
  variants.delete(s)
  const answer = romanizeSyllable(s)
  const pool = [...variants].map(romanizeSyllable).filter((r) => r !== answer)
  const parts = [p.initial, p.vowel, p.final].filter(Boolean).map((c) => `${c} ${letter(c)?.rom.split(' / ')[0] ?? ''}`)
  return {
    itemId: s,
    prompt: s,
    promptLang: 'ko',
    options: options(answer, pool, rng),
    optionLang: 'latin',
    answer,
    say: s,
    explain: parts.join(' + '),
  }
}

/** Eine Runde mit ROUND_SIZE Fragen für diese Stufe */
export function makeRound(lesson: Lesson, p: HangulProgress, rng: Rng = Math.random, library: { title: string; originalTitle?: string }[] = []): Question[] {
  if (lesson.kind === 'letters') {
    const own = [...lesson.letters].map((c) => letter(c)!)
    const earlier = earlierLetters(lesson)
    const pool = [...earlier, ...own]
    // Zwei Wiederholungen aus früheren Stufen an zufälligen Stellen, der Rest neu
    const review = earlier.length ? pickWeighted(earlier, (l) => l.ch, p, 2, rng) : []
    const picked = pickWeighted(own, (l) => l.ch, p, ROUND_SIZE - review.length, rng)
    for (const r of review) picked.splice(Math.floor(rng() * (picked.length + 1)), 0, r)
    return picked.map((l) => letterQuestion(l, pool, rng))
  }
  if (lesson.kind === 'syllables') {
    const all: string[] = []
    for (const i of lesson.initials) for (const v of lesson.vowels) for (const f of lesson.finals) all.push(compose(i, v, f))
    return pickWeighted(shuffle(all, rng), (s) => s, p, ROUND_SIZE, rng).map((s) => syllableQuestion(s, lesson, rng))
  }
  if (lesson.kind === 'words') {
    return pickWeighted(DRAMA_WORDS, (w) => `w:${w.ko}`, p, ROUND_SIZE, rng, true).map((w) => ({
      itemId: `w:${w.ko}`,
      prompt: w.ko,
      promptLang: 'ko' as const,
      options: options(w.rom, DRAMA_WORDS.map((x) => x.rom), rng),
      optionLang: 'latin' as const,
      answer: w.rom,
      say: w.ko,
      explain: `„${w.de}“`,
    }))
  }
  const { own, famous } = titleCards(library)
  const cards = [...own, ...famous]
  // Eigene Dramen bevorzugen: bis zu sieben aus der Bibliothek, der Rest bekannte
  const fromOwn = pickWeighted(own, (c) => `t:${c.ko}`, p, Math.min(7, own.length), rng, true)
  const picked = pickWeighted(famous, (c) => `t:${c.ko}`, p, ROUND_SIZE - fromOwn.length, rng, true)
  // Eigene Titel an zufälligen Stellen einstreuen (beide Listen sind verschieden – nichts doppelt nebeneinander)
  for (const c of fromOwn) picked.splice(Math.floor(rng() * (picked.length + 1)), 0, c)
  return picked.map((c) => ({
    itemId: `t:${c.ko}`,
    prompt: c.ko,
    promptLang: 'ko' as const,
    options: options(c.title, cards.map((x) => x.title), rng),
    optionLang: 'latin' as const,
    answer: c.title,
    say: c.ko,
  }))
}
