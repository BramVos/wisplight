import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  // A sandboxed preload (M10.19) cannot be an ES module: built as CommonJS.
  preload: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: {
    plugins: [react()],
    // The browser fallback in client.ts reads content/ from outside the renderer root.
    server: { fs: { allow: [resolve(import.meta.dirname)] } },
  },
})
