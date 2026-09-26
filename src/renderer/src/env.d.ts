/// <reference types="vite/client" />
import type { EngineClient } from './client'

declare global {
  interface Window {
    wisplight?: EngineClient
  }
}

export {}
