import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useProject } from '@/state/project'
import { openMotionBlur } from '@/state/editing'
import { setPicking, useTranscription } from '@/state/transcription'
import { quick } from '@/lib/motion'
import { Icon, type IconName } from './Icon'
import styles from './PluginsMenu.module.css'

interface Plugin {
  label: string
  icon: IconName
  enabled: boolean
  run(): void
}

/** Menu « Plugins » de la barre du haut. Les mêmes entrées sont dans le menu de l'app (main/index.ts). */
export function PluginsMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const hasAudio = useProject((s) => s.project.lanes.some((l) => l.kind === 'audio'))
  const hasVideo = useProject((s) => s.project.lanes.some((l) => l.kind === 'video' && !l.look))
  const transcribing = useTranscription((s) => s.running)

  const plugins: Plugin[] = [
    { label: 'Transcript', icon: 'captions', enabled: hasAudio && !transcribing, run: () => setPicking(true) },
    { label: 'Motion blur', icon: 'motion', enabled: hasVideo, run: openMotionBlur }
  ]

  useEffect(() => {
    if (!open) return
    const close = (event: Event): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !anchor.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('blur', close)
    }
  }, [open])

  return (
    <div ref={anchor} className={styles.anchor}>
      <button className={styles.button} data-open={open} onClick={() => setOpen((value) => !value)}>
        Plugins
        <motion.span className={styles.chevron} animate={{ rotate: open ? 180 : 0 }} transition={quick}>
          <Icon name="chevron-down" size={14} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.menu}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={quick}
            role="menu"
          >
            {plugins.map((plugin) => (
              <button
                key={plugin.label}
                role="menuitem"
                className={styles.item}
                disabled={!plugin.enabled}
                onClick={() => {
                  setOpen(false)
                  plugin.run()
                }}
              >
                <Icon name={plugin.icon} size={14} />
                {plugin.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
