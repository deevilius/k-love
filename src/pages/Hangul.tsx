import { useEffect, useMemo, useRef, useState } from 'react'
import { updateHangul, useDramas, useHangulProgress } from '../db/repo'
import {
  KNOWN_LEVEL,
  LESSONS,
  LETTERS,
  PASS_SCORE,
  ROUND_SIZE,
  compose,
  finishRound,
  isUnlocked,
  knownLetters,
  letter,
  makeRound,
  recordAnswer,
  streak,
  titleCards,
  type HangulProgress,
  type Lesson,
  type Question,
} from '../lib/hangul'
import { speakKorean, useKoreanVoice } from '../lib/speech'
import { cx, today } from '../lib/util'
import { confirmDialog } from '../components/Dialogs'

type View =
  | { name: 'overview' }
  | { name: 'intro'; lesson: Lesson }
  | { name: 'quiz'; lesson: Lesson; round: number }
  | { name: 'done'; lesson: Lesson; score: number; passedNow: boolean }

type LibraryTitle = { title: string; originalTitle?: string }
let roundSeq = 0

const PREVIEW: Record<string, string> = {
  silben1: '가 너 도 루',
  batchim: '간 공 밥 일',
  woerter: '사랑해',
  titel: '도깨비',
}
const preview = (l: Lesson) => (l.kind === 'letters' ? [...l.letters].join(' ') : PREVIEW[l.id] ?? '')

export default function Hangul() {
  const progress = useHangulProgress()
  const dramas = useDramas()
  const [view, setView] = useState<View>({ name: 'overview' })
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view.name])
  const startQuiz = (lesson: Lesson) => setView({ name: 'quiz', lesson, round: ++roundSeq })

  if (view.name === 'intro') return <Intro lesson={view.lesson} library={dramas ?? []} onStart={() => startQuiz(view.lesson)} onBack={() => setView({ name: 'overview' })} />
  if (view.name === 'quiz')
    // Erst starten, wenn die Bibliothek geladen ist (Titel-Stufe)
    return dramas ? (
      <Quiz
        key={view.round}
        lesson={view.lesson}
        progress={progress}
        library={dramas}
        onCancel={() => setView({ name: 'overview' })}
        onDone={(score, passedNow) => setView({ name: 'done', lesson: view.lesson, score, passedNow })}
      />
    ) : null
  if (view.name === 'done') {
    const next = LESSONS[LESSONS.indexOf(view.lesson) + 1]
    return (
      <Done
        score={view.score}
        passedNow={view.passedNow}
        next={next && isUnlocked(next, progress) ? next : undefined}
        onAgain={() => startQuiz(view.lesson)}
        onNext={(l) => setView({ name: 'intro', lesson: l })}
        onOverview={() => setView({ name: 'overview' })}
      />
    )
  }
  return <Overview progress={progress} onOpen={(lesson) => setView({ name: 'intro', lesson })} />
}

// ---------- Übersicht ----------

function Overview({ progress, onOpen }: { progress: HangulProgress; onOpen: (l: Lesson) => void }) {
  const voice = useKoreanVoice()
  const days = streak(progress.days, today())
  const known = knownLetters(progress)
  const [selected, setSelected] = useState<string | null>(null)
  const sel = selected ? letter(selected) : undefined
  const allPassed = LESSONS.every((l) => (progress.best[l.id] ?? 0) >= PASS_SCORE)

  const unlockAll = async () => {
    const ok = await confirmDialog('Alle Stufen freischalten? Dein bisheriger Lernstand bleibt erhalten.', { confirmLabel: 'Freischalten' })
    if (ok) await updateHangul((p) => ({ ...p, unlockAll: true }))
  }

  return (
    <div className="space-y-6">
      <section className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <div className="ko grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 text-4xl font-bold text-white shadow">한글</div>
        <div className="flex-1 space-y-1">
          <h1 className="h-display text-2xl font-bold">Hangul lesen lernen</h1>
          <p className="text-sm text-stone-600 dark:text-rose-100/70">
            Das koreanische Alphabet hat nur 24 Grundzeichen. In ein paar Tagen liest du Originaltitel und Wörter aus deinen Dramen – zehn Fragen pro Runde.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="chip">{days > 0 ? `🔥 ${days} ${days === 1 ? 'Tag' : 'Tage'} in Folge` : '🔥 Heute schon geübt?'}</span>
            <span className="chip">
              ✅ {known} von {LETTERS.length} Zeichen sicher
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="h-display mb-3 text-lg font-bold">Stufen</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LESSONS.map((l, i) => {
            const open = isUnlocked(l, progress)
            const best = progress.best[l.id]
            const passed = (best ?? 0) >= PASS_SCORE
            return (
              <button
                key={l.id}
                type="button"
                disabled={!open}
                onClick={() => onOpen(l)}
                className={cx(
                  'card flex items-center gap-4 p-4 text-left transition',
                  open ? 'hover:-translate-y-0.5 hover:shadow-md' : 'opacity-55',
                  passed && 'border-emerald-200 dark:border-emerald-500/30',
                )}
                title={open ? undefined : 'Erst die vorige Stufe mit mindestens 8 von 10 schaffen'}
              >
                <span
                  className={cx(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold',
                    passed ? 'bg-emerald-500 text-white' : open ? 'bg-pink-600 text-white' : 'bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-stone-400',
                  )}
                >
                  {passed ? '✓' : open ? i + 1 : '🔒'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{l.title}</span>
                  <span className="ko block truncate text-lg text-stone-500 dark:text-rose-100/70">{preview(l)}</span>
                </span>
                {best !== undefined && (
                  <span className="text-right text-xs font-bold text-stone-500 tabular-nums dark:text-rose-100/60">
                    Bestes
                    <br />
                    {best}/{ROUND_SIZE}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="h-display text-lg font-bold">Hangul-Tafel</h2>
          <p className="text-sm text-stone-500 dark:text-rose-100/70">Grün = sicher (mehrmals hintereinander richtig). Tippe ein Zeichen an für Aussprache und Merkhilfe.</p>
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
          {LETTERS.map((l) => {
            const level = progress.items[l.ch] ?? 0
            return (
              <button
                key={l.ch}
                type="button"
                onClick={() => {
                  setSelected(l.ch)
                  speakKorean(l.say)
                }}
                aria-label={`${l.ch}: ${l.rom}`}
                className={cx(
                  'ko aspect-square rounded-xl text-2xl font-bold transition hover:scale-105',
                  level >= KNOWN_LEVEL
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                    : level > 0
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
                      : 'bg-rose-50 text-stone-500 dark:bg-white/5 dark:text-rose-100/60',
                  selected === l.ch && 'ring-2 ring-pink-500',
                )}
              >
                {l.ch}
              </button>
            )
          })}
        </div>
        {sel && (
          <div className="flex items-center gap-4 rounded-xl bg-rose-50 p-3 dark:bg-white/5" aria-live="polite">
            <span className="ko text-4xl font-bold">{sel.ch}</span>
            <div className="text-sm">
              <div className="font-extrabold">{sel.rom}</div>
              <div className="text-stone-600 dark:text-rose-100/70">{sel.hint}</div>
            </div>
          </div>
        )}
        {!voice && (
          <p className="text-xs text-stone-500 dark:text-rose-100/60">
            🔈 Für die Aussprache braucht Windows die koreanische Stimme: Einstellungen → Zeit und Sprache → Sprache und Region → Sprache hinzufügen → Koreanisch (mit
            „Text-in-Sprache“). Danach K-Love neu starten.
          </p>
        )}
      </section>

      {!progress.unlockAll && !allPassed && (
        <div className="text-center">
          <button type="button" className="btn-ghost text-xs" onClick={unlockAll}>
            Ich kann schon etwas Hangul – alle Stufen freischalten
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Einführung vor der Runde ----------

function Intro({ lesson, library, onStart, onBack }: { lesson: Lesson; library: LibraryTitle[]; onStart: () => void; onBack: () => void }) {
  const voice = useKoreanVoice()
  const ownTitles = useMemo(() => titleCards(library).own.length, [library])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button type="button" className="btn-ghost -ml-3" onClick={onBack}>
        ← Übersicht
      </button>
      <h1 className="h-display text-2xl font-bold">{lesson.title}</h1>

      {lesson.kind === 'letters' && (
        <>
          <p className="text-sm text-stone-600 dark:text-rose-100/70">Schau dir die neuen Zeichen kurz an{voice ? ' und hör sie dir an' : ''} – danach kommen zehn Fragen.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...lesson.letters].map((c) => {
              const l = letter(c)!
              return (
                <button key={c} type="button" onClick={() => speakKorean(l.say)} className="card flex items-center gap-4 p-4 text-left transition hover:shadow-md">
                  <span className="ko w-14 text-center text-5xl font-bold text-pink-700 dark:text-pink-300">{c}</span>
                  <span className="text-sm">
                    <span className="block text-base font-extrabold">{l.rom}</span>
                    <span className="text-stone-600 dark:text-rose-100/70">{l.hint}</span>
                  </span>
                  {voice && <span className="ml-auto text-lg" aria-hidden>🔊</span>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {lesson.id === 'silben1' && (
        <div className="card space-y-4 p-5 text-sm leading-relaxed">
          <p>Koreanisch schreibt man nicht Buchstabe für Buchstabe, sondern in <b>Silbenblöcken</b>: ein Konsonant, dann ein Vokal.</p>
          <Blocks items={[['ㄱ', 'ㅏ'], ['ㄴ', 'ㅓ'], ['ㅁ', 'ㅣ']]} note="Senkrechter Vokal (ㅏ ㅓ ㅣ) → rechts daneben" />
          <Blocks items={[['ㄱ', 'ㅗ'], ['ㄷ', 'ㅜ'], ['ㅅ', 'ㅡ']]} note="Waagerechter Vokal (ㅗ ㅜ ㅡ) → darunter" />
          <Blocks items={[['ㅇ', 'ㅏ'], ['ㅇ', 'ㅜ']]} note="Beginnt die Silbe mit einem Vokal, steht davor das stumme ㅇ" />
        </div>
      )}

      {lesson.id === 'batchim' && (
        <div className="card space-y-4 p-5 text-sm leading-relaxed">
          <p>
            Unten im Block kann noch ein Konsonant stehen – der <b>Schlusskonsonant</b> (Batchim). Am Silbenende klingen manche Zeichen anders:
          </p>
          <Blocks items={[['ㄱ', 'ㅏ', 'ㄴ'], ['ㅂ', 'ㅏ', 'ㅂ'], ['ㄱ', 'ㅗ', 'ㅇ'], ['ㅇ', 'ㅣ', 'ㄹ']]} note="ㄱ → k, ㄹ → l, ㅂ → p, ㅇ → ng" />
          <p className="text-stone-600 dark:text-rose-100/70">Neu sind auch die behauchten Konsonanten und die Vokale mit j aus den letzten beiden Stufen.</p>
        </div>
      )}

      {lesson.kind === 'words' && (
        <div className="card space-y-2 p-5 text-sm leading-relaxed">
          <p>Jetzt liest du echte Wörter, die in fast jedem Drama vorkommen – von 사랑해 bis 대박. Nach jeder Antwort siehst du, was das Wort bedeutet.</p>
          <p className="text-stone-600 dark:text-rose-100/70">Tipp: Silbe für Silbe lesen. Die Umschrift folgt der offiziellen Romanisierung.</p>
        </div>
      )}

      {lesson.kind === 'titles' && (
        <div className="card space-y-2 p-5 text-sm leading-relaxed">
          <p>Erkennst du das Drama am koreanischen Titel?</p>
          <p className="text-stone-600 dark:text-rose-100/70">
            {ownTitles > 0
              ? `${ownTitles} ${ownTitles === 1 ? 'Drama' : 'Dramen'} aus deiner Bibliothek ${ownTitles === 1 ? 'hat' : 'haben'} einen koreanischen Originaltitel – die kommen bevorzugt dran, dazu bekannte Klassiker.`
              : 'In deiner Bibliothek hat noch kein Drama einen koreanischen Originaltitel – darum kommen bekannte Klassiker dran. Trag beim Bearbeiten den Originaltitel ein, dann übst du mit deinen eigenen Dramen.'}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="btn-primary" onClick={onStart} autoFocus>
          Los geht's – {ROUND_SIZE} Fragen
        </button>
      </div>
    </div>
  )
}

/** Zeigt, wie Zeichen zu einem Block werden: ㄱ + ㅏ = 가 */
function Blocks({ items, note }: { items: [string, string, string?][]; note: string }) {
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {items.map(([i, v, f]) => (
          <button
            key={i + v + (f ?? '')}
            type="button"
            onClick={() => speakKorean(compose(i, v, f))}
            className="ko rounded-xl bg-rose-50 px-3 py-2 text-lg dark:bg-white/5"
          >
            {[i, v, f].filter(Boolean).join(' + ')} = <b className="text-2xl text-pink-700 dark:text-pink-300">{compose(i, v, f)}</b>
          </button>
        ))}
      </div>
      <div className="mt-1 text-xs text-stone-500 dark:text-rose-100/60">{note}</div>
    </div>
  )
}

// ---------- Fragerunde ----------

const CAPTION: Record<Lesson['kind'], [string, string]> = {
  // [Hangul gezeigt, Umschrift gezeigt]
  letters: ['Wie klingt dieses Zeichen?', 'Welches Zeichen ist das?'],
  syllables: ['Wie liest man diese Silbe?', ''],
  words: ['Wie liest man dieses Wort?', ''],
  titles: ['Welches Drama ist das?', ''],
}

function Quiz({
  lesson,
  progress,
  library,
  onCancel,
  onDone,
}: {
  lesson: Lesson
  progress: HangulProgress
  library: LibraryTitle[]
  onCancel: () => void
  onDone: (score: number, passedNow: boolean) => void
}) {
  const voice = useKoreanVoice()
  // Die Runde wird einmal erzeugt; der Lernstand ändert sich währenddessen
  const [questions] = useState<Question[]>(() => makeRound(lesson, progress, Math.random, library))
  const startBest = useRef(progress.best[lesson.id] ?? 0)
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [results, setResults] = useState<boolean[]>([])
  const q = questions[index]
  const answered = chosen !== null

  const next = () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1)
      setChosen(null)
      return
    }
    const score = results.filter(Boolean).length
    void updateHangul((p) => finishRound(p, lesson.id, score, today()))
    onDone(score, score >= PASS_SCORE && startBest.current < PASS_SCORE)
  }

  const choose = (opt: string) => {
    if (answered) return
    const ok = opt === q.answer
    setChosen(opt)
    setResults((r) => [...r, ok])
    void updateHangul((p) => recordAnswer(p, q.itemId, ok))
    if (q.say) speakKorean(q.say)
  }

  // Richtig → nach kurzer Pause weiter; falsch → warten, damit man die Lösung ansehen kann
  const nextRef = useRef(next)
  nextRef.current = next
  useEffect(() => {
    if (chosen === null || chosen !== q.answer) return
    const t = setTimeout(() => nextRef.current(), 1100)
    return () => clearTimeout(t)
  }, [chosen, q])

  // Tasten 1–4 wählen, Enter = weiter, Esc = abbrechen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || document.querySelector('[aria-modal="true"]')) return
      const n = Number(e.key)
      if (n >= 1 && n <= q.options.length && !answered) {
        e.preventDefault()
        choose(q.options[n - 1])
      } else if (e.key === 'Enter' && answered) {
        e.preventDefault()
        nextRef.current()
      } else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!q) return null
  const caption = CAPTION[lesson.kind][q.promptLang === 'ko' ? 0 : 1]
  const bigKo = lesson.kind === 'letters' || lesson.kind === 'syllables'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" className="btn-ghost -ml-3" onClick={onCancel} title="Abbrechen (Esc)">
          ✕
        </button>
        <div className="flex flex-1 gap-1" aria-label={`Frage ${index + 1} von ${questions.length}`}>
          {questions.map((_, i) => (
            <span
              key={i}
              className={cx(
                'h-2 flex-1 rounded-full',
                results[i] === true ? 'bg-emerald-500' : results[i] === false ? 'bg-rose-500' : i === index ? 'bg-pink-300 dark:bg-pink-500/50' : 'bg-rose-100 dark:bg-white/10',
              )}
            />
          ))}
        </div>
        <span className="text-sm font-bold text-stone-500 tabular-nums dark:text-rose-100/60">
          {index + 1}/{questions.length}
        </span>
      </div>

      <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
        <div className="text-sm font-semibold text-stone-500 dark:text-rose-100/60">{caption}</div>
        <div
          className={cx(
            'font-bold',
            q.promptLang === 'ko' ? cx('ko', bigKo ? 'text-8xl' : 'text-5xl leading-tight') : 'text-5xl tracking-wide',
          )}
          lang={q.promptLang === 'ko' ? 'ko' : undefined}
        >
          {q.prompt}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {q.options.map((opt, i) => {
          const isAnswer = opt === q.answer
          const isChosen = opt === chosen
          return (
            <button
              key={opt}
              type="button"
              onClick={() => choose(opt)}
              disabled={answered && !isAnswer && !isChosen}
              className={cx(
                'card relative flex min-h-16 items-center justify-center px-4 py-3 text-center font-bold transition',
                q.optionLang === 'ko' ? 'ko text-4xl' : 'text-lg',
                !answered && 'hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-md',
                answered && isAnswer && 'border-2 border-emerald-400 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/35 dark:text-white',
                answered && isChosen && !isAnswer && 'border-2 border-rose-400 bg-rose-100 text-rose-700 dark:bg-rose-500/35 dark:text-white',
                answered && !isAnswer && !isChosen && 'opacity-40',
              )}
            >
              <span className="absolute top-1.5 left-2.5 text-[10px] font-bold text-stone-400">{i + 1}</span>
              {opt}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className={cx('card flex items-center gap-3 p-4', chosen === q.answer ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-rose-200 dark:border-rose-500/30')} aria-live="polite">
          <span className="text-2xl" aria-hidden>
            {chosen === q.answer ? '💗' : '💡'}
          </span>
          <div className="flex-1 text-sm">
            <div className="font-bold">{chosen === q.answer ? 'Richtig!' : `Richtig wäre: ${q.answer}`}</div>
            {q.explain && <div className="ko text-stone-600 dark:text-rose-100/70">{q.explain}</div>}
          </div>
          {voice && q.say && (
            <button type="button" className="btn-ghost text-lg" onClick={() => speakKorean(q.say!)} aria-label="Nochmal anhören">
              🔊
            </button>
          )}
          {chosen !== q.answer && (
            <button type="button" className="btn-primary" onClick={next} autoFocus>
              Weiter
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Ergebnis ----------

function Done({
  score,
  passedNow,
  next,
  onAgain,
  onNext,
  onOverview,
}: {
  score: number
  passedNow: boolean
  next?: Lesson
  onAgain: () => void
  onNext: (l: Lesson) => void
  onOverview: () => void
}) {
  const passed = score >= PASS_SCORE
  const msg =
    score === ROUND_SIZE ? 'Perfekt! 대박! 🎉' : passed ? 'Super gemacht! 화이팅!' : score >= 5 ? 'Gut dabei – noch eine Runde, dann sitzt es.' : 'Aller Anfang ist schwer. Schau dir die Zeichen nochmal an.'
  return (
    <div className="mx-auto max-w-md">
      <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="text-5xl tabular-nums">
          <b>{score}</b>
          <span className="text-2xl text-stone-400">/{ROUND_SIZE}</span>
        </div>
        <div className="text-2xl" aria-hidden>
          {'♥'.repeat(Math.round(score / 2))}
          <span className="text-rose-200 dark:text-white/15">{'♥'.repeat(5 - Math.round(score / 2))}</span>
        </div>
        <p className="ko font-semibold">{msg}</p>
        {passedNow && next && <p className="chip">🔓 Neu freigeschaltet: {next.title}</p>}
        {!passed && <p className="text-sm text-stone-500 dark:text-rose-100/70">Ab {PASS_SCORE} richtigen Antworten wird die nächste Stufe frei.</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {passed && next ? (
            <button type="button" className="btn-primary" onClick={() => onNext(next)} autoFocus>
              Weiter: {next.title}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={onAgain} autoFocus>
              Nochmal
            </button>
          )}
          {passed && next && (
            <button type="button" className="btn-outline" onClick={onAgain}>
              Nochmal
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onOverview}>
            Übersicht
          </button>
        </div>
      </div>
    </div>
  )
}
