import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useProject } from '@/state/project'
import { TRANSCRIBE_DRAG_TYPE, setPicking, transcribeLanes, useTranscription } from '@/state/transcription'
import { quick } from '@/lib/motion'
import { Icon } from '../Icon'
import styles from './TranscribeButton.module.css'

const PHASE_LABEL = { download: 'Téléchargement du modèle', load: 'Préparation', transcribe: 'Transcription' } as const

/**
 * Bouton « Transcrire » : un clic ouvre « Quelle piste transcrire ? » ; on peut aussi le glisser sur une piste audio
 * pour la transcrire directement.
 */
export function TranscribeButton(): React.JSX.Element {
  const open = useTranscription((s) => s.picking)
  const running = useTranscription((s) => s.running)
  const phase = useTranscription((s) => s.phase)
  const fraction = useTranscription((s) => s.fraction)
  const error = useTranscription((s) => s.error)
  const hasAudio = useProject((s) => s.project.lanes.some((l) => l.kind === 'audio'))

  return (
    <div className={styles.anchor}>
      <button
        className={styles.button}
        disabled={!hasAudio || running}
        draggable={hasAudio && !running}
        title="Cliquer pour choisir les pistes, ou glisser sur une piste audio"
        onDragStart={(event) => {
          event.dataTransfer.setData(TRANSCRIBE_DRAG_TYPE, '1')
          event.dataTransfer.effectAllowed = 'copy'
          setPicking(false)
        }}
        onClick={() => setPicking(!open)}
      >
        <Icon name="captions" size={14} />
        {running ? (
          <span className="mono">
            {PHASE_LABEL[phase ?? 'load']}
            {fraction !== null ? ` ${Math.floor(fraction * 100)} %` : '…'}
          </span>
        ) : (
          'Transcrire'
        )}
        {running && fraction !== null && <motion.span className={styles.progress} animate={{ scaleX: fraction }} transition={{ duration: 0.2 }} />}
      </button>
      <AnimatePresence>{open && <LanePicker onClose={closePicker} />}</AnimatePresence>
      <AnimatePresence>
        {error && !running && (
          <motion.span className={styles.error} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={quick}>
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

const closePicker = (): void => setPicking(false)

/** « Quelle piste transcrire ? » : les pistes audio à cocher (le micro est coché d'office). */
function LanePicker({ onClose }: { onClose(): void }): React.JSX.Element {
  // On filtre hors du sélecteur : un nouveau tableau à chaque lecture ferait boucler le rendu.
  const allLanes = useProject((s) => s.project.lanes)
  const lanes = useMemo(() => allLanes.filter((l) => l.kind === 'audio'), [allLanes])
  const [chosen, setChosen] = useState<Set<string>>(() => {
    const micro = lanes.find((l) => /micro/i.test(l.name))
    return new Set([(micro ?? lanes[0])?.id].filter((id): id is string => Boolean(id)))
  })
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (event: Event): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !panel.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [onClose])

  return (
    <motion.div
      ref={panel}
      className={styles.panel}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
      transition={quick}
    >
      <div className={styles.title}>Quelle piste transcrire ?</div>
      {lanes.map((lane) => (
        <label key={lane.id} className={styles.option}>
          <input
            type="checkbox"
            checked={chosen.has(lane.id)}
            onChange={() =>
              setChosen((current) => {
                const next = new Set(current)
                if (next.has(lane.id)) next.delete(lane.id)
                else next.add(lane.id)
                return next
              })
            }
          />
          <span className={styles.check} aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
          {lane.name}
        </label>
      ))}
      <button
        className={styles.primary}
        disabled={chosen.size === 0}
        onClick={() => {
          // Dans l'ordre des pistes, pour que les sous-titres arrivent dans le même ordre.
          void transcribeLanes(lanes.filter((l) => chosen.has(l.id)).map((l) => l.id))
          onClose()
        }}
      >
        Transcrire
      </button>
    </motion.div>
  )
}
