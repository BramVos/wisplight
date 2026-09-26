import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Runs only the interface in a browser, with the engine inside the page.
// Handy for quick UI work: npm run web

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [import.meta.dirname] },
  },
})
