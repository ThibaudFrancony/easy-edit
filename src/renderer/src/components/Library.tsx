import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ClipFile } from '@shared/types'
import { thumbnailURL, useLibrary } from '@/state/library'
import { clipTime, shortDuration } from '@/lib/format'
import { fade, rise, standard } from '@/lib/motion'
import { Icon } from './Icon'
import styles from './Library.module.css'

export const CLIP_DRAG_TYPE = 'application/x-easyedit-clip'

export function Library(): React.JSX.Element {
  const clips = useLibrary((s) => s.clips)
  const loaded = useLibrary((s) => s.loaded)

  return (
    <aside className={styles.library}>
      <div className={styles.title}>Clips</div>
      <AnimatePresence mode="wait">
        {loaded && clips.length === 0 ? (
          <motion.div key="empty" className={styles.empty} {...rise} transition={standard}>
            <button className={styles.openFolder} onClick={() => window.api.openClipsFolder()}>
              <Icon name="folder" />
              Ouvrir le dossier
            </button>
          </motion.div>
        ) : (
          <motion.div key="grid" className={styles.grid} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
            <AnimatePresence>
              {clips.map((clip, index) => (
                <ClipCard key={clip.path} clip={clip} index={index} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  )
}

function ClipCard({ clip, index }: { clip: ClipFile; index: number }): React.JSX.Element {
  const duration = useLibrary((s) => s.details[clip.path]?.duration)
  const setDragged = useLibrary((s) => s.setDragged)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const compressed = clip.path.toLowerCase().includes('compressé')

  useEffect(() => {
    let alive = true
    thumbnailURL(clip.path).then((url) => alive && setThumbnail(url), () => {})
    return () => {
      alive = false
    }
  }, [clip.path])

  return (
    <motion.div layout {...rise} transition={{ ...standard, delay: Math.min(index, 12) * 0.03 }}>
      {/* Glisser-déposer natif (HTML5) : motion réserve `onDragStart` à ses propres gestes, d'où ce conteneur. */}
      <div
        className={styles.card}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CLIP_DRAG_TYPE, clip.path)
          event.dataTransfer.effectAllowed = 'copy'
          setDragged(clip)
        }}
        onDragEnd={() => setDragged(null)}
      >
      <div className={styles.thumb}>
        <AnimatePresence>
          {thumbnail && <motion.img key={thumbnail} src={thumbnail} alt="" draggable={false} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade} />}
        </AnimatePresence>
        {duration !== undefined && <span className={`${styles.badge} mono`}>{shortDuration(duration)}</span>}
      </div>
      <span className={styles.name}>
        {clipTime(clip.createdAt)}
        {compressed && <span className={styles.tag}>compressé</span>}
      </span>
      </div>
    </motion.div>
  )
}
