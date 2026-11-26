// Macht aus dem Abschnitt „Unveröffentlicht“ in CHANGELOG.md die neue Version
// und schreibt dessen Text nach release-notes.md (wird zur Beschreibung des GitHub-Releases).
//
//   node scripts/changelog.mjs 0.2.0 [CHANGELOG.md] [release-notes.md]
import { readFileSync, writeFileSync } from 'node:fs'

const [version, file = 'CHANGELOG.md', notesFile = 'release-notes.md'] = process.argv.slice(2)
if (!/^\d+\.\d+\.\d+/.test(version ?? '')) fail('Bitte die neue Version angeben, z. B. 0.2.0')

const HEADING = '## Unveröffentlicht'
const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const start = text.indexOf(HEADING + '\n')
if (start < 0) fail(`„${HEADING}“ fehlt in ${file}`)

const bodyStart = start + HEADING.length + 1
const next = text.indexOf('\n## ', bodyStart)
const bodyEnd = next < 0 ? text.length : next + 1
const notes = text.slice(bodyStart, bodyEnd).trim()
if (!notes) fail(`Unter „${HEADING}“ steht nichts. Trag zuerst ein, was sich geändert hat – das sehen die Nutzer vor dem Update.`)
if (text.includes(`\n## ${version} `)) fail(`Version ${version} steht schon im Changelog`)

const date = new Date().toISOString().slice(0, 10)
const updated = text.slice(0, bodyStart) + '\n' + `## ${version} – ${date}\n\n${notes}\n\n` + text.slice(bodyEnd)
writeFileSync(file, updated)
writeFileSync(notesFile, notes + '\n')
console.log(`CHANGELOG.md: „${HEADING}“ → ${version}\n\n${notes}`)

function fail(msg) {
  console.error('❌ ' + msg)
  process.exit(1)
}
