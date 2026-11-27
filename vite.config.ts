import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Content-Security-Policy für die gebaute App (im Dev-Server nicht, Vite braucht dort Inline-Skripte).
 * Erlaubt nur, was K-Love wirklich nutzt: TVmaze/Wikipedia/Wikidata/GitHub-API, YouTube- und Spotify-Player,
 * Bilder aus dem Netz und aus dem lokalen Poster-Zwischenspeicher (klove-img:).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: klove-img:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.tvmaze.com https://en.wikipedia.org https://query.wikidata.org https://api.github.com klove-img:",
  'frame-src https://www.youtube-nocookie.com https://www.youtube.com https://open.spotify.com',
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'klove-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

// Nur Desktop-App (Electron): Updates kommen über electron-updater
export default defineConfig({
  plugins: [react(), tailwindcss(), csp()],
})
