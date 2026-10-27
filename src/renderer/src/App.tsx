import { useEffect } from 'react'
import type { MenuAction } from '@shared/types'
import { projectDuration } from '@shared/project'
import { player } from '@/engine/player'
import { deleteSelection, openMotionBlur, pruneSelection, selectAll, splitAtPlayhead, toggleLinkSelection } from '@/state/editing'
import { useLibrary } from '@/state/library'
import { useProject } from '@/state/project'
import { useTimeline } from '@/state/timeline'
import { fileName } from '@/lib/format'
import { isMac } from '@/lib/platform'
import { useExport } from '@/state/export'
import { setPicking } from '@/state/transcription'
import { toggleFullscreen, toggleMonitor, watchScreens } from '@/state/screens'
import { ExportPanel } from './components/ExportPanel'
import { ContextMenu } from './components/timeline/ContextMenu'
import { Icon } from './components/Icon'
import { Inspector } from './components/Inspector'
import { Library } from './components/Library'
import { Logo } from './components/Logo'
import { PluginsMenu } from './components/PluginsMenu'
import { Preview } from './components/Preview'
import { Timeline } from './components/timeline/Timeline'
import { useKeyboard } from './useKeyboard'
import styles from './App.module.css'

export function App(): React.JSX.Element {
  const path = useProject((s) => s.path)
  const empty = useProject((s) => s.project.segments.length === 0)
  useKeyboard()
  useAppEvents()

  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        {isMac ? (
          <>
            <Logo size={16} />
            <span className={styles.appName}>Easy Edit</span>
          </>
        ) : (
          // Windows n'a pas de barre des menus : le menu de l'app s'ouvre ici.
          <button
            className={styles.menuButton}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect()
              void window.api.popupMenu(box.left, box.bottom + 4)
            }}
          >
            <Logo size={16} />
            <span className={styles.appName}>Easy Edit</span>
          </button>
        )}
        {path && (
          <>
            <span className={styles.separator}>/</span>
            <span className={styles.projectName}>{fileName(path)}</span>
          </>
        )}
        <div className={styles.grow} />
        <PluginsMenu />
        <button className={styles.exportButton} disabled={empty} onClick={() => void useExport.getState().show()}>
          <Icon name="export" size={15} />
          Exporter
        </button>
      </header>
      <div className={styles.workspace}>
        <Library />
        <Preview />
        <Inspector />
      </div>
      <Timeline />
      <ExportPanel />
      <ContextMenu />
    </div>
  )
}

function useAppEvents(): void {
  useEffect(() => {
    const refresh = (): void => void useLibrary.getState().refresh()
    window.api.loadInitialProject().then((opened) => useProject.getState().load(opened))
    refresh()
    window.addEventListener('focus', refresh)

    // Le moteur de lecture suit le projet ouvert.
    player.setProject(useProject.getState().project)
    const unsubscribe = useProject.subscribe((state, previous) => {
      if (state.project !== previous.project) {
        player.setProject(state.project)
        pruneSelection()
      }
      if (state.path !== previous.path) player.seek(0)
    })

    const offProject = window.api.onProjectOpened((opened) => useProject.getState().load(opened))
    const offMenu = window.api.onMenu((action) => {
      const { pixelsPerSecond, zoomTo, zoomToFit } = useTimeline.getState()
      const actions: Record<MenuAction, () => void> = {
        'zoom-in': () => zoomTo(pixelsPerSecond * 1.5, player.time()),
        'zoom-out': () => zoomTo(pixelsPerSecond / 1.5, player.time()),
        'zoom-fit': () => zoomToFit(projectDuration(useProject.getState().project)),
        undo: () => useProject.getState().undo(),
        redo: () => useProject.getState().redo(),
        'select-all': selectAll,
        split: splitAtPlayhead,
        delete: () => deleteSelection(false),
        'delete-close-gap': () => deleteSelection(true),
        'toggle-link': toggleLinkSelection,
        export: () => void useExport.getState().show(),
        fullscreen: toggleFullscreen,
        monitor: toggleMonitor,
        transcribe: () => setPicking(true),
        'motion-blur': openMotionBlur
      }
      actions[action]()
    })

    const offScreens = watchScreens()

    return () => {
      offScreens()
      window.removeEventListener('focus', refresh)
      unsubscribe()
      offProject()
      offMenu()
    }
  }, [])
}
