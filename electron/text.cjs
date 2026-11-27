// Hilfsfunktionen für Release-Notizen – ohne Electron-Abhängigkeiten, damit testbar

/** Release-Notizen kommen von GitHub als HTML – für die Oberfläche in reinen Text umwandeln */
function htmlToText(html) {
  if (!html) return ''
  return String(html)
    .replace(/\r\n/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*(p|li|h[1-6]|ul|ol|div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/^- /gm, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}(?=• )/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

module.exports = { htmlToText, compareVersions }
