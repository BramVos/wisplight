import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { EditorApp } from './EditorApp'
import { applyDisplay, loadDisplay } from './display'
import './styles.css'

// Text size and contrast as the player set them (M9.4).
applyDisplay(loadDisplay())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The editor (M8) is the same page with ?editor: its own window in the desktop app, its own tab in the preview. */}
    {new URLSearchParams(window.location.search).has('editor') ? <EditorApp /> : <App />}
  </StrictMode>,
)
