import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Segment } from '@shared/types'
import { isTransformed } from '@shared/geometry'
import { applyFrameToAllCaptions, captionsShareFrame, editFrame, resetFrame, useCanvas } from '@/state/canvas'
import { deleteLane, deleteSelection, splitAtPlayhead, toggleLinkSelection } from '@/state/editing'
import { useProject } from '@/state/project'
import { useTimeline } from '@/state/timeline'
import { quick } from '@/lib/motion'
import { Icon, type IconName } from '../Icon'
import styles from './ContextMenu.module.css'

interface Item {
  label: string
  shortcut?: string
  icon: IconName
  run(): void
  /** Trait de séparation avant cette entrée. */
  separated?: boolean
}

/**
 * Menu du clic droit, sur un morceau de la timeline ou sur l'aperçu. Couper, lier et supprimer agissent sur la
 * sélection ; redimensionner et rogner sur le morceau visé (vidéo ou image). Sur l'en-tête d'une piste : la supprimer.
 */
export function ContextMenu(): React.JSX.Element {
  const menu = useCanvas((s) => s.menu)
  const close = useCanvas((s) => s.closeMenu)
  const linked = useTimeline((s) => useProject.getState().project.segments.some((seg) => s.selection.has(seg.id) && seg.linkId))
  const target = useProject((s) => (menu?.segmentId ? s.project.segments.find((seg) => seg.id === menu.segmentId) : undefined))
  const framable = useProject((s) => (target ? s.project.lanes.find((l) => l.id === target.laneId)?.kind === 'video' : false))

  useEffect(() => {
    if (!menu) return
    const onEvent = (event: Event): void => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      close()
    }
    window.addEventListener('pointerdown', onEvent)
    window.addEventListener('keydown', onEvent)
    window.addEventListener('blur', onEvent)
    return () => {
      window.removeEventListener('pointerdown', onEvent)
      window.removeEventListener('keydown', onEvent)
      window.removeEventListener('blur', onEvent)
    }
  }, [menu, close])

  const items: Item[] = menu?.laneId ? laneItems(menu.laneId) : segmentItems(target, framable, linked)
  const position = menu

  return (
    <AnimatePresence>
      {position && (
        <motion.div
          className={styles.menu}
          style={{ left: position.x, top: position.y }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          transition={quick}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={styles.item}
              data-separated={item.separated ?? false}
              onClick={() => {
                item.run()
                close()
              }}
            >
              <Icon name={item.icon} size={14} />
              <span className={styles.label}>{item.label}</span>
              {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function laneItems(laneId: string): Item[] {
  return [{ label: 'Supprimer la piste', icon: 'trash', run: () => deleteLane(laneId) }]
}

function segmentItems(target: Segment | undefined, framable: boolean, linked: boolean): Item[] {
  const items: Item[] = []
  if (target && framable) {
    items.push({ label: 'Redimensionner', icon: 'resize', run: () => editFrame(target.id, 'resize') })
    // Un sous-titre ne se rogne pas.
    if (!target.caption) items.push({ label: 'Rogner', icon: 'crop', run: () => editFrame(target.id, 'crop') })
    if (isTransformed(target)) items.push({ label: 'Réinitialiser le cadrage', icon: 'reset', run: () => resetFrame(target.id) })
    if (target.caption && !captionsShareFrame(useProject.getState().project, target.id)) {
      items.push({ label: 'Appliquer à toute la piste', icon: 'captions', run: () => applyFrameToAllCaptions(target.id) })
    }
  }
  items.push(
    { label: 'Couper au curseur', shortcut: 'S', icon: 'scissors', run: splitAtPlayhead, separated: items.length > 0 },
    { label: linked ? 'Délier' : 'Lier', shortcut: '⌘L', icon: linked ? 'unlink' : 'link', run: toggleLinkSelection },
    { label: 'Supprimer', shortcut: '⌫', icon: 'trash', run: () => deleteSelection(false) },
    { label: 'Supprimer et refermer', shortcut: '⇧⌫', icon: 'trash', run: () => deleteSelection(true) }
  )
  return items
}
