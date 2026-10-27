import { useEffect } from 'react'
import { projectDuration } from '@shared/project'
import { player, usePlayback } from '@/engine/player'
import { deleteSelection, selectAll, splitAtPlayhead, toggleLinkSelection } from '@/state/editing'
import { useCanvas } from '@/state/canvas'
import { useExport } from '@/state/export'
import { useProject } from '@/state/project'
import { commandKey, isMac } from '@/lib/platform'
import { setFullscreen, toggleFullscreen, toggleMonitor, useScreens } from '@/state/screens'
import { useTimeline } from '@/state/timeline'

/**
 * Tous les raccourcis de l'app. Ceux du menu y sont affichés sans y être enregistrés (`registerAccelerator: false`) :
 * c'est ici qu'ils agissent, ce qui laisse S, ⌫ ou ⌘Z fonctionner normalement quand on écrit dans un champ.
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input:not([type="range"]), textarea, [contenteditable="true"]')) return
      // L'autre touche de modification (Ctrl sur Mac, Windows sur PC) ne déclenche aucun raccourci.
      if (event.altKey || (isMac ? event.ctrlKey : event.metaKey)) return
      // Le panneau d'export a ses propres touches (Entrée, Échap).
      if (useExport.getState().open) return

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const command = commandKey(event)
      const shift = event.shiftKey
      const { undo, redo } = useProject.getState()

      const actions: Record<string, (() => void) | undefined> = command
        ? {
            z: shift ? redo : undo,
            a: selectAll,
            l: toggleLinkSelection,
            // Sur Mac, ceux-là passent par la barre des menus ; Windows n'en a pas.
            ...(isMac ? {} : windowsMenuShortcuts(shift))
          }
        : {
            ' ': () => player.toggle(),
            j: () => player.shuttle(-1),
            k: () => player.shuttle(0),
            l: () => player.shuttle(1),
            s: splitAtPlayhead,
            f: shift ? toggleMonitor : toggleFullscreen,
            z: shift ? () => useTimeline.getState().zoomToFit(projectDuration(useProject.getState().project)) : undefined,
            Backspace: () => deleteSelection(shift),
            Delete: () => deleteSelection(shift),
            ArrowLeft: () => player.step(shift ? -10 : -1),
            ArrowRight: () => player.step(shift ? 10 : 1),
            Home: () => player.seek(0),
            End: () => player.seek(usePlayback.getState().duration),
            Escape: () => {
              if (useScreens.getState().fullscreen) return setFullscreen(false)
              if (useCanvas.getState().editing) return useCanvas.getState().stopEditing()
              useTimeline.getState().setSelection(new Set())
              useTimeline.getState().inspect(null)
            }
          }
      const action = actions[key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Les raccourcis du menu de l'app, sur Windows (Ctrl+…). */
function windowsMenuShortcuts(shift: boolean): Record<string, (() => void) | undefined> {
  const { load, redo } = useProject.getState()
  const zoom = (factor: number) => (): void => {
    const { pixelsPerSecond, zoomTo } = useTimeline.getState()
    zoomTo(pixelsPerSecond * factor, player.time())
  }
  return {
    n: () => void window.api.newProject().then(load),
    o: () => void window.api.openProject().then((opened) => opened && load(opened)),
    e: () => void useExport.getState().show(),
    y: shift ? undefined : redo,
    '=': zoom(1.5),
    '+': zoom(1.5),
    '-': zoom(1 / 1.5)
  }
}
