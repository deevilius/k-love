/**
 * Koreanische Aussprache über die Sprachausgabe des Systems (Windows: Einstellungen → Zeit und Sprache →
 * Sprache → Koreanisch hinzufügen). Offline, ohne Konto. Fehlt die Stimme, blendet die App den Knopf aus.
 */
import { useEffect, useState } from 'react'

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined)

function koreanVoice(): SpeechSynthesisVoice | undefined {
  return synth()
    ?.getVoices()
    .find((v) => v.lang.toLowerCase().startsWith('ko'))
}

/** true, sobald eine koreanische Stimme installiert ist (die Stimmenliste lädt verzögert) */
export function useKoreanVoice(): boolean {
  const [ok, setOk] = useState(() => !!koreanVoice())
  useEffect(() => {
    const s = synth()
    if (!s) return
    const check = () => setOk(!!koreanVoice())
    check()
    s.addEventListener('voiceschanged', check)
    return () => s.removeEventListener('voiceschanged', check)
  }, [])
  return ok
}

export function speakKorean(text: string) {
  const s = synth()
  const voice = koreanVoice()
  if (!s || !voice) return
  s.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.8
  s.speak(u)
}
