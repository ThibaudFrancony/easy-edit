import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { deleteSelection, splitAtPlayhead, toggleLinkSelection } from '@/state/editing'
import { useProject } from '@/state/project'
import { useTimeline } from '@/state/timeline'
import { quick } from '@/lib/motion'
import { Icon, type IconName } from '../Icon'
import styles from './ContextMenu.module.css'

export interface MenuPosition {
  x: number
  y: number
}

interface Item {
  label: string
  shortcut: string
  icon: IconName
  run(): void
}

/** Menu du clic droit sur un morceau : il agit sur la sélection, comme le menu Montage. */
export function ContextMenu({ position, onClose }: { position: MenuPosition | null; onClose(): void }): React.JSX.Element {
  const linked = useTimeline((s) => useProject.getState().project.segments.some((seg) => s.selection.has(seg.id) && seg.linkId))

  useEffect(() => {
    if (!position) return
    const close = (event: Event): void => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('blur', close)
    }
  }, [position, onClose])

  const items: Item[] = [
    { label: 'Couper au curseur', shortcut: 'S', icon: 'scissors', run: splitAtPlayhead },
    { label: linked ? 'Délier' : 'Lier', shortcut: '⌘L', icon: linked ? 'unlink' : 'link', run: toggleLinkSelection },
    { label: 'Supprimer', shortcut: '⌫', icon: 'trash', run: () => deleteSelection(false) },
    { label: 'Supprimer et refermer', shortcut: '⇧⌫', icon: 'trash', run: () => deleteSelection(true) }
  ]

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
              onClick={() => {
                item.run()
                onClose()
              }}
            >
              <Icon name={item.icon} size={14} />
              <span className={styles.label}>{item.label}</span>
              <span className={styles.shortcut}>{item.shortcut}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
