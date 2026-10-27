import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { CaptionWord, Lane, MotionBlur } from '@shared/types'
import { CAPTION_ACCENTS, CAPTION_STYLES, DEFAULT_LOOK } from '@shared/captions'
import { DEFAULT_MOTION_BLUR } from '@shared/motion-blur'
import { CaptionText } from './Captions'
import { deleteLane, renameLane, setLaneLook, setLaneMotionBlur, setLaneVolume, toggleLaneMute, toggleLaneNormalized } from '@/state/editing'
import { useProject } from '@/state/project'
import { useTimeline } from '@/state/timeline'
import { quick, standard } from '@/lib/motion'
import { Icon } from './Icon'
import styles from './Inspector.module.css'

export const INSPECTOR_WIDTH = 300

/** Réglages de la piste choisie dans la timeline. Glisse depuis la droite, se referme quand on clique dans le vide. */
export function Inspector(): React.JSX.Element {
  const laneId = useTimeline((s) => s.inspectedLane)
  const lane = useProject((s) => s.project.lanes.find((l) => l.id === laneId))

  return (
    <AnimatePresence initial={false}>
      {lane && (
        <motion.aside
          className={styles.inspector}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: INSPECTOR_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={standard}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={lane.id}
              className={styles.content}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={standard}
            >
              <LaneSettings lane={lane} />
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function LaneSettings({ lane }: { lane: Lane }): React.JSX.Element {
  const percent = Math.round(lane.volume * 100)
  // On garde toujours au moins une piste vidéo.
  const videoLaneCount = useProject((s) => s.project.lanes.filter((l) => l.kind === 'video').length)
  const video = lane.kind === 'video'
  const caption = lane.kind === 'video' && lane.look !== undefined
  const editable = lane.music || video || caption

  return (
    <>
      <div className={styles.header}>
        <span className={styles.dot} data-kind={caption ? 'caption' : video ? 'video' : lane.music ? 'music' : 'audio'} />
        {editable ? <LaneName lane={lane} /> : <span className={styles.name}>{lane.name}</span>}
        <button className="icon-button" aria-label="Fermer" onClick={() => useTimeline.getState().inspect(null)}>
          <Icon name="close" size={14} />
        </button>
      </div>

      {caption ? (
        <CaptionSettings lane={lane} />
      ) : video ? (
        <>
          <MotionBlurSettings lane={lane} />
          {videoLaneCount > 1 && (
            <button className={styles.delete} onClick={() => deleteLane(lane.id)}>
              <Icon name="trash" size={14} />
              Supprimer la piste
            </button>
          )}
        </>
      ) : (
        <AudioSettings lane={lane} percent={percent} />
      )}
    </>
  )
}

const SAMPLE: CaptionWord[] = [
  { text: 'Salut', start: 0, end: 0.4 },
  { text: 'tout', start: 0.4, end: 0.8 },
  { text: 'le', start: 0.8, end: 1 },
  { text: 'monde', start: 1, end: 1.5 }
]

/** Style des sous-titres (vignettes) et couleur du mot prononcé. */
function CaptionSettings({ lane }: { lane: Lane }): React.JSX.Element {
  const look = lane.look ?? DEFAULT_LOOK
  return (
    <>
      <div className={styles.styles} role="radiogroup" aria-label="Style des sous-titres">
        {CAPTION_STYLES.map((style) => (
          <button
            key={style.id}
            role="radio"
            aria-checked={look.style === style.id}
            className={styles.styleCard}
            onClick={() => setLaneLook(lane.id, { ...look, style: style.id })}
          >
            <span className={styles.stylePreview}>
              <CaptionText look={{ ...look, style: style.id }} words={SAMPLE} time={0.5} zoom={2.6} />
            </span>
            <span className={styles.styleName}>{style.name}</span>
          </button>
        ))}
      </div>
      <div className={styles.accents} role="radiogroup" aria-label="Couleur d'accent">
        <button
          role="radio"
          aria-checked={look.accent === null}
          aria-label="Sans accent"
          title="Sans accent"
          className={styles.swatch}
          data-none
          onClick={() => setLaneLook(lane.id, { ...look, accent: null })}
        />
        {CAPTION_ACCENTS.map((color) => (
          <button
            key={color}
            role="radio"
            aria-checked={look.accent === color}
            aria-label={color}
            className={styles.swatch}
            style={{ background: color }}
            onClick={() => setLaneLook(lane.id, { ...look, accent: color })}
          />
        ))}
      </div>
      <button className={styles.delete} onClick={() => deleteLane(lane.id)}>
        <Icon name="trash" size={14} />
        Supprimer la piste
      </button>
    </>
  )
}

function AudioSettings({ lane, percent }: { lane: Lane; percent: number }): React.JSX.Element {
  return (
    <>

      <div className={styles.volume}>
        <div className={styles.volumeRow}>
          <span className={`${styles.value} mono`} data-muted={lane.muted}>
            {percent} %
          </span>
          <button
            className="icon-button"
            aria-label={lane.muted ? 'Remettre le son' : 'Couper le son'}
            aria-pressed={lane.muted}
            onClick={() => toggleLaneMute(lane.id)}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={lane.muted ? 'off' : 'on'}
                className={styles.swap}
                data-muted={lane.muted}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={quick}
              >
                <Icon name={lane.muted ? 'speaker-off' : 'speaker'} size={18} />
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
        <VolumeSlider lane={lane} />
        <div className={`${styles.scale} mono`}>
          <span>0</span>
          <span>100</span>
          <span>200</span>
        </div>
      </div>

      <button className={styles.toggleRow} role="switch" aria-checked={lane.normalized} onClick={() => toggleLaneNormalized(lane.id)}>
        <span>Normaliser</span>
        <span className={styles.switch} data-on={lane.normalized}>
          <motion.span className={styles.knob} animate={{ x: lane.normalized ? 16 : 0 }} transition={quick} />
        </span>
      </button>

      {lane.music && (
        <button className={styles.delete} onClick={() => deleteLane(lane.id)}>
          <Icon name="trash" size={14} />
          Supprimer la piste
        </button>
      )}
    </>
  )
}

/** Plugin « Motion blur » : appliqué à l'export seulement (l'aperçu montre la vidéo sans flou). */
function MotionBlurSettings({ lane }: { lane: Lane }): React.JSX.Element {
  const blur = lane.motionBlur ?? { ...DEFAULT_MOTION_BLUR, enabled: false }
  const set = (change: Partial<MotionBlur>): void => setLaneMotionBlur(lane.id, change)
  const percent = Math.round(blur.amount * 100)

  return (
    <div className={styles.section}>
      <button className={styles.toggleRow} role="switch" aria-checked={blur.enabled} onClick={() => set({ enabled: !blur.enabled })}>
        <span>Motion blur</span>
        <span className={styles.switch} data-on={blur.enabled}>
          <motion.span className={styles.knob} animate={{ x: blur.enabled ? 16 : 0 }} transition={quick} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {blur.enabled && (
          <motion.div
            className={styles.collapsible}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={standard}
          >
            <div className={styles.fields}>
              <div className={styles.field}>
                <span>Intensité</span>
                <span className={`${styles.fieldValue} mono`}>{percent} %</span>
              </div>
              <div className={styles.slider} onDoubleClick={() => set({ amount: DEFAULT_MOTION_BLUR.amount })}>
                <div className={styles.track} />
                <motion.div className={styles.fill} animate={{ width: `${percent}%` }} transition={quick} />
                <motion.div className={styles.thumb} animate={{ left: `${percent}%` }} transition={quick} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={percent}
                  aria-label="Intensité"
                  onChange={(event) => setLaneMotionBlur(lane.id, { amount: Number(event.target.value) / 100 }, `blur-amount:${lane.id}`)}
                />
              </div>
              <Choice label="Qualité" value={blur.quality} options={[[4, '4'], [8, '8'], [16, '16']]} onChange={(quality) => set({ quality })} />
              <Choice
                label="Pondération"
                value={blur.weighting}
                options={[['equal', 'Égale'], ['gaussian', 'Douce']]}
                onChange={(weighting) => set({ weighting })}
              />
              <Choice label="Cadence" value={blur.fps} options={[[60, '60 i/s'], [30, '30 i/s']]} onChange={(fps) => set({ fps })} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Un choix parmi quelques valeurs, en boutons collés. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: [T, string][]
  onChange(value: T): void
}): React.JSX.Element {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <div className={styles.segmented} role="radiogroup" aria-label={label}>
        {options.map(([option, text]) => (
          <button key={option} role="radio" aria-checked={option === value} className={`${styles.segment} mono`} onClick={() => onChange(option)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Curseur de 0 à 200 %, avec un repère à 100 %. Double-clic : retour à 100 %. */
function VolumeSlider({ lane }: { lane: Lane }): React.JSX.Element {
  const fill = (lane.volume / 2) * 100
  return (
    <div className={styles.slider} data-muted={lane.muted} onDoubleClick={() => setLaneVolume(lane.id, 1)}>
      <div className={styles.track} />
      <motion.div className={styles.fill} animate={{ width: `${fill}%` }} transition={quick} />
      <div className={styles.unity} />
      <motion.div className={styles.thumb} animate={{ left: `${fill}%` }} transition={quick} />
      <input
        type="range"
        min={0}
        max={200}
        step={1}
        value={Math.round(lane.volume * 100)}
        aria-label="Volume"
        onChange={(event) => setLaneVolume(lane.id, Number(event.target.value) / 100)}
      />
    </div>
  )
}

/** Nom d'une piste de fond sonore, modifiable en place. */
function LaneName({ lane }: { lane: Lane }): React.JSX.Element {
  const [draft, setDraft] = useState(lane.name)
  useEffect(() => setDraft(lane.name), [lane.name])

  return (
    <input
      className={styles.nameInput}
      value={draft}
      aria-label="Nom de la piste"
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => (draft.trim() ? renameLane(lane.id, draft) : setDraft(lane.name))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(lane.name)
          event.currentTarget.blur()
        }
        event.stopPropagation()
      }}
    />
  )
}
