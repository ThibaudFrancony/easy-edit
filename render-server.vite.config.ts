import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Le service de rendu du PC Linux (voir src/render-server/index.ts) : Node seul, sans Electron.
// Les dépendances restent dans node_modules (build SSR) : le service tourne depuis le dépôt.
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  build: {
    ssr: true,
    target: 'node24',
    outDir: 'out/render-server',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/render-server/index.ts',
        'motion-blur-worker': 'src/main/motion-blur-worker.ts'
      },
      output: { format: 'cjs', entryFileNames: '[name].js' }
    }
  }
})
