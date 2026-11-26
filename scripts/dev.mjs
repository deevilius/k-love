// Entwicklung: Vite-Dev-Server starten und Electron darauf zeigen lassen (mit Hot-Reload).
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron') // Pfad zur electron.exe

const server = await createServer({ server: { port: 5173, strictPort: false } })
await server.listen()
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/'
console.log(`Vite läuft auf ${url} – starte Electron …`)

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
