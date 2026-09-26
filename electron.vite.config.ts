import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    // The browser fallback in client.ts reads content/ from outside the renderer root.
    server: { fs: { allow: [resolve(import.meta.dirname)] } },
  },
})
