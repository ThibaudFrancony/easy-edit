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

const IMPORTABLE = /\.(mp3|m4a|aac|wav|aiff?|flac|ogg|png|jpe?g|webp|bmp|tiff?)$/i

/** Ordre d'affichage des sections ; une section sans fichier n'apparaît pas. */
const SECTIONS: { kind: LibraryFile['kind']; title: string }[] = [
  { kind: 'video', title: 'Vidéos' },
  { kind: 'image', title: 'Images' },
  { kind: 'audio', title: 'Sons' }
]

/** Sons et images glissés depuis le Finder (les autres fichiers sont ignorés). */
export function droppedMediaPaths(event: React.DragEvent): string[] {
  return [...event.dataTransfer.files].map((file) => window.api.pathForFile(file)).filter((path) => IMPORTABLE.test(path))
}

export function Library(): React.JSX.Element {
  const files = useLibrary((s) => s.files)
  const loaded = useLibrary((s) => s.loaded)
  const importFiles = useLibrary((s) => s.importFiles)
  const [dropping, setDropping] = useState(false)
  const sections = SECTIONS.map((section) => ({ ...section, files: files.filter((file) => file.kind === section.kind) })).filter(
    (section) => section.files.length > 0
  )

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
        const paths = droppedMediaPaths(event)
        if (paths.length > 0) void importFiles(paths)
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Fichiers</span>
        <button
          className="icon-button"
          aria-label="Importer un son ou une image"
          title="Importer un son ou une image"
          onClick={() => void window.api.pickFiles().then(() => useLibrary.getState().refresh())}
        >
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
          <motion.div key="grid" className={styles.sections} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
            <AnimatePresence>
              {sections.map((section) => (
                <motion.section key={section.kind} className={styles.section} layout {...rise} transition={standard}>
                  <h3 className={styles.heading}>{section.title}</h3>
                  <div className={styles.grid}>
                    <AnimatePresence>
                      {section.files.map((file, index) => (
                        <FileCard key={file.path} file={file} index={index} />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.section>
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
  const image = file.kind === 'image'

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
          ) : image ? (
            <img src={window.api.mediaURL(file.path)} alt="" draggable={false} />
          ) : (
            <Thumbnail path={file.path} />
          )}
          {duration !== undefined && !image && <span className={`${styles.badge} mono`}>{shortDuration(duration)}</span>}
        </div>
        <span className={styles.name}>
          {audio || image ? <span className={styles.fileName}>{fileName(file.path)}</span> : clipTime(file.createdAt)}
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
