import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: shared },
    build: { externalizeDeps: true }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
