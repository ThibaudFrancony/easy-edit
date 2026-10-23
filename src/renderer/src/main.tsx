import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/500.css'
import './styles.css'
import { App } from './App'
import { player } from './engine/player'
import { useLibrary } from './state/library'
import { useProject } from './state/project'

// En développement, l'état est accessible depuis la console (et pour les tests pilotés par un agent).
if (import.meta.env.DEV) Object.assign(window, { easyEdit: { player, useLibrary, useProject } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
