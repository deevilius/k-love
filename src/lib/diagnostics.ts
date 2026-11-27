/** Fehlerprotokoll und Feedback für Beta-Tester */

const REPO = 'https://github.com/deevilius/k-love'
const MAX_ERRORS = 20
const errors: string[] = []

export function recordError(msg: string) {
  const line = `${new Date().toLocaleTimeString('de-DE')} ${msg}`.slice(0, 300)
  if (errors[errors.length - 1] === line) return
  errors.push(line)
  if (errors.length > MAX_ERRORS) errors.shift()
}

/** Unbehandelte Fehler mitschreiben, damit sie im Feedback landen */
export function installErrorLog() {
  window.addEventListener('error', (e) => recordError(e.message || String(e.error)))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string } | undefined
    recordError(String(r?.message ?? r))
  })
}

/** Öffnet ein vorausgefülltes GitHub-Issue mit Version, Windows-Version und den letzten Fehlern */
export async function openFeedback(kind: 'feedback' | 'bug', error?: string) {
  const d = await window.klove?.diagnostics().catch(() => null)
  const info = [
    `- K-Love: ${d?.version ?? 'Browser'}`,
    d && `- System: ${d.os}`,
    d && `- Profildatei vorhanden: ${d.hasProfile ? 'ja' : 'nein'}`,
    d?.youtubeIssue && `- Letztes YouTube-Problem: ${d.youtubeIssue}`,
    `- Seite: ${location.hash || '/'}`,
  ].filter(Boolean)
  const log = [...(error ? [error] : []), ...errors].slice(-10)

  const body = [
    kind === 'bug' ? '**Was hast du gerade gemacht, als der Fehler kam?**' : '**Was möchtest du uns sagen?**',
    '',
    '',
    '',
    '---',
    '_Technische Infos (automatisch eingefügt):_',
    ...info,
    ...(log.length ? ['', '```', ...log, '```'] : []),
  ].join('\n')

  const title = kind === 'bug' ? '[Beta] Fehler: ' : '[Beta] Feedback: '
  const url = `${REPO}/issues/new?${new URLSearchParams({ title, body: body.slice(0, 6000) })}`
  window.open(url, '_blank', 'noopener')
}
