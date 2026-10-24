import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LibraryFile } from '@shared/types'
import { thumbnailURL, useLibrary } from '@/state/library'
import { clipTime, fileName, shortDuration } from '@/lib/format'
import { fade, rise, standard } from '@/lib/motion'
import { Icon } from './Icon'
import { Waveform } from './timeline/Waveform'
import styles from './Library.module.css'

export const CLIP_DRAG_TYPE = 'application/x-easyedit-clip'

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|aiff?|flac|ogg)$/i

export function isAudioFile(path: string): boolean {
  return AUDIO_EXTENSIONS.test(path)
}

/** Sons glissés depuis le Finder (fichiers non audio ignorés). */
export function droppedAudioPaths(event: React.DragEvent): string[] {
  return [...event.dataTransfer.files].map((file) => window.api.pathForFile(file)).filter(isAudioFile)
}

export function Library(): React.JSX.Element {
  const files = useLibrary((s) => s.files)
  const loaded = useLibrary((s) => s.loaded)
  const importSounds = useLibrary((s) => s.importSounds)
  const [dropping, setDropping] = useState(false)

  return (
    <aside
      className={styles.library}
      data-dropping={dropping}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDropping(false)
        const paths = droppedAudioPaths(event)
        if (paths.length > 0) void importSounds(paths)
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Fichiers</span>
        <button className="icon-button" aria-label="Importer un son" title="Importer un son" onClick={() => void window.api.pickSounds().then(() => useLibrary.getState().refresh())}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      <AnimatePresence mode="wait">
        {loaded && files.length === 0 ? (
          <motion.div key="empty" className={styles.empty} {...rise} transition={standard}>
            <button className={styles.openFolder} onClick={() => window.api.openClipsFolder()}>
              <Icon name="folder" />
              Ouvrir le dossier
            </button>
          </motion.div>
        ) : (
          <motion.div key="grid" className={styles.grid} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
            <AnimatePresence>
              {files.map((file, index) => (
                <FileCard key={file.path} file={file} index={index} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  )
}

function FileCard({ file, index }: { file: LibraryFile; index: number }): React.JSX.Element {
  const duration = useLibrary((s) => s.details[file.path]?.duration)
  const stream = useLibrary((s) => s.details[file.path]?.audioTracks[0]?.stream)
  const setDragged = useLibrary((s) => s.setDragged)
  const audio = file.kind === 'audio'

  return (
    <motion.div layout {...rise} transition={{ ...standard, delay: Math.min(index, 12) * 0.03 }}>
      {/* Glisser-déposer natif (HTML5) : motion réserve `onDragStart` à ses propres gestes, d'où ce conteneur. */}
      <div
        className={styles.card}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CLIP_DRAG_TYPE, file.path)
          event.dataTransfer.effectAllowed = 'copy'
          setDragged(file)
        }}
        onDragEnd={() => setDragged(null)}
      >
        <div className={styles.thumb} data-audio={audio}>
          {audio ? (
            stream !== undefined && duration !== undefined ? (
              <Waveform source={file.path} stream={stream} sourceStart={0} duration={duration} color="var(--music-wave)" />
            ) : null
          ) : (
            <Thumbnail path={file.path} />
          )}
          {duration !== undefined && <span className={`${styles.badge} mono`}>{shortDuration(duration)}</span>}
        </div>
        <span className={styles.name}>
          {audio ? <span className={styles.fileName}>{fileName(file.path)}</span> : clipTime(file.createdAt)}
          {file.path.toLowerCase().includes('compressé') && <span className={styles.tag}>compressé</span>}
        </span>
      </div>
    </motion.div>
  )
}

function Thumbnail({ path }: { path: string }): React.JSX.Element {
  const [url, setURL] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    thumbnailURL(path).then((value) => alive && setURL(value), () => {})
    return () => {
      alive = false
    }
  }, [path])

  return (
    <AnimatePresence>
      {url && <motion.img key={url} src={url} alt="" draggable={false} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade} />}
    </AnimatePresence>
  )
}
