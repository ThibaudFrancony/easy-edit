import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/jetbrains-mono/500.css'
import './styles.css'
import { App } from './App'
import { Monitor } from './components/Monitor'
import { player } from './engine/player'
import * as editing from './state/editing'
import { useLibrary } from './state/library'
import { useProject } from './state/project'
import { useTimeline } from './state/timeline'

// Les styles propres à un système (barre de titre de Windows) s'appuient sur cet attribut.
document.documentElement.dataset.platform = window.api.platform

// La même interface sert à la fenêtre du deuxième écran, qui n'affiche que l'image.
const isMonitor = location.hash === '#monitor'

// En développement, l'état est accessible depuis la console (et pour les tests pilotés par un agent).
if (import.meta.env.DEV && !isMonitor) Object.assign(window, {
    easyEdit: { player, useLibrary, useProject, useTimeline, editing, pps: () => useTimeline.getState().pixelsPerSecond }
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isMonitor ? <Monitor /> : <App />}
  </StrictMode>
)
