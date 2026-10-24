import { create } from 'zustand'
import { player } from '@/engine/player'
import { useCanvas } from './canvas'
import { useExport } from './export'
import { useProject } from './project'

// Aperçu en plein écran dans la fenêtre, ou recopié en plein écran sur un autre écran (le « moniteur »).
// Le moniteur est une deuxième fenêtre qui suit le projet et l'horloge de celle-ci ; le son reste ici.

interface ScreensState {
  fullscreen: boolean
  /** Le moniteur est ouvert sur l'autre écran. */
  monitor: boolean
  /** Un autre écran est branché : le bouton du moniteur n'apparaît qu'alors. */
  otherDisplay: boolean
}

export const useScreens = create<ScreensState>()(() => ({ fullscreen: false, monitor: false, otherDisplay: false }))

export function setFullscreen(on: boolean): void {
  if (useScreens.getState().fullscreen === on) return
  if (on) useCanvas.getState().stopEditing()
  useScreens.setState({ fullscreen: on })
  void window.api.setFullScreen(on)
}

export const toggleFullscreen = (): void => setFullscreen(!useScreens.getState().fullscreen)

export function toggleMonitor(): void {
  const { monitor, otherDisplay } = useScreens.getState()
  if (monitor || otherDisplay) void window.api.setMonitor(!monitor)
}

let ratio = '16 / 10'

/** Format de l'image de l'aperçu, recopié sur le moniteur. */
export function mirrorRatio(next: string): void {
  if (next === ratio) return
  ratio = next
  if (useScreens.getState().monitor) window.api.sendMonitor({ ratio })
}

/** Suit les écrans branchés et, tant que le moniteur est ouvert, lui envoie le projet et l'horloge. */
export function watchScreens(): () => void {
  void window.api.hasOtherDisplay().then((otherDisplay) => useScreens.setState({ otherDisplay }))
  const offDisplay = window.api.onOtherDisplay((otherDisplay) => useScreens.setState({ otherDisplay }))
  // Le panneau d'export glisse depuis le haut de la fenêtre : on sort du plein écran pour le voir.
  const offExport = useExport.subscribe((state, previous) => {
    if (state.open && !previous.open) setFullscreen(false)
  })
  let stopMirror: (() => void) | null = null
  const offMonitor = window.api.onMonitor((monitor) => {
    useScreens.setState({ monitor })
    stopMirror?.()
    stopMirror = monitor ? mirror() : null
  })
  return () => {
    offDisplay()
    offExport()
    offMonitor()
    stopMirror?.()
  }
}

function mirror(): () => void {
  const sendClock = (): void => window.api.sendMonitor({ clock: player.clock() })
  const offReady = window.api.onMonitorReady(() =>
    window.api.sendMonitor({ project: useProject.getState().project, ratio, clock: player.clock() })
  )
  const offProject = useProject.subscribe((state, previous) => {
    if (state.project !== previous.project) window.api.sendMonitor({ project: state.project })
  })
  const offClock = player.onClock(sendClock)
  // L'horloge du son et celle du système dérivent un peu : on recale le moniteur chaque seconde pendant la lecture.
  const timer = setInterval(() => {
    if (player.playing) sendClock()
  }, 1000)
  return () => {
    offReady()
    offProject()
    offClock()
    clearInterval(timer)
  }
}
