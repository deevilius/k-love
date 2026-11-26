import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Nur Desktop-App (Electron): Updates kommen über electron-updater
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
