import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Desktop-Build (Electron): kein Service-Worker – Updates kommen über electron-updater
const isElectron = !!process.env.ELECTRON

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    !isElectron &&
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'K-Love – Meine K-Dramen',
        short_name: 'K-Love',
        description: 'K-Dramen sammeln, bewerten und OSTs hören',
        theme_color: '#be185d',
        background_color: '#fff1f5',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(image\.tmdb\.org|static\.tvmaze\.com|upload\.wikimedia\.org|thumb\.wikimedia\.org)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'tmdb-images', expiration: { maxEntries: 500 } },
          },
        ],
      },
    }),
  ],
})
