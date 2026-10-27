import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ExportQuality, ExportStep } from '@shared/types'
import { usePlayback } from '@/engine/player'
import { useExport } from '@/state/export'
import { fade, quick, standard } from '@/lib/motion'
import { fileName } from '@/lib/format'
import { fileManager, thisComputer } from '@/lib/platform'
import { Icon } from './Icon'
import styles from './ExportPanel.module.css'

const QUALITIES: { value: ExportQuality; label: string }[] = [
  { value: 'source', label: "Taille d'origine" },
  { value: '1080p', label: '1080p' }
]

/** Panneau d'export : il glisse depuis le haut de la fenêtre, au-dessus du montage. */
export function ExportPanel(): React.JSX.Element {
  const open = useExport((s) => s.open)
  const status = useExport((s) => s.status)
  const hide = useExport((s) => s.hide)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && status !== 'running') hide()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, status, hide])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            onPointerDown={() => status !== 'running' && hide()}
          />
          <motion.div
            className={styles.panel}
            role="dialog"
            aria-label="Exporter"
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16, transition: { duration: 0.18 } }}
            transition={standard}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={status === 'error' ? 'idle' : status}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
                transition={standard}
              >
                {status === 'running' ? <Progress /> : status === 'done' ? <Done /> : <Settings />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Settings(): React.JSX.Element {
  const { name, folder, quality, error, renderServer, remote, needsCode, setName, setFolder, setQuality, setRemote, submitCode, start, hide } =
    useExport()
  const empty = usePlayback((s) => s.duration === 0)
  const [code, setCode] = useState('')
  const askCode = needsCode && remote && renderServer !== null

  return (
    <form
      className={styles.settings}
      onSubmit={(event) => {
        event.preventDefault()
        if (empty || !name.trim()) return
        if (askCode) void submitCode(code)
        else start()
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Exporter</span>
        <button type="button" className="icon-button" aria-label="Fermer" onClick={hide}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <label className={styles.field}>
        <input autoFocus value={name} spellCheck={false} aria-label="Nom du fichier" onChange={(event) => setName(event.target.value)} />
        <span className="mono">.mp4</span>
      </label>

      <div className={styles.folderRow}>
        <Icon name="folder" size={14} />
        <span className={styles.folder} title={folder}>
          {fileName(folder)}
        </span>
        <button
          type="button"
          className={styles.secondary}
          onClick={async () => {
            const picked = await window.api.pickFolder(folder)
            if (picked) setFolder(picked)
          }}
        >
          Changer
        </button>
      </div>

      <AnimatePresence initial={false}>
        {renderServer !== null && (
          <motion.div
            className={styles.reveal}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={standard}
          >
            <div className={styles.segmented} role="radiogroup" aria-label="Rendu">
              {[
                { value: false, label: thisComputer },
                { value: true, label: renderServer }
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  role="radio"
                  aria-checked={remote === option.value}
                  className={styles.segment}
                  onClick={() => setRemote(option.value)}
                >
                  {remote === option.value && <motion.span layoutId="export-target" className={styles.segmentHighlight} transition={quick} />}
                  <span className={styles.segmentLabel}>{option.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {askCode && (
          <motion.label
            className={`${styles.field} ${styles.reveal}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 36 }}
            exit={{ opacity: 0, height: 0 }}
            transition={standard}
          >
            <input
              autoFocus
              className="mono"
              value={code}
              inputMode="numeric"
              maxLength={6}
              placeholder={`Code de ${renderServer}`}
              aria-label={`Code de ${renderServer}`}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </motion.label>
        )}
      </AnimatePresence>

      <div className={styles.segmented} role="radiogroup" aria-label="Qualité">
        {QUALITIES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={quality === option.value}
            className={styles.segment}
            onClick={() => setQuality(option.value)}
          >
            {quality === option.value && <motion.span layoutId="export-quality" className={styles.segmentHighlight} transition={quick} />}
            <span className={styles.segmentLabel}>{option.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p className={styles.error} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={standard}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <button type="submit" className={styles.primary} disabled={empty || !name.trim() || (askCode && code.length !== 6)}>
        <Icon name="export" size={15} />
        Exporter
      </button>
    </form>
  )
}

/** Le nom de l'étape en cours ; rien pour un export simple sur cet ordinateur. */
const STEP_LABELS: Record<ExportStep, string> = { upload: 'Envoi', blur: 'Motion blur', encode: 'Encodage', download: 'Réception' }

function Progress(): React.JSX.Element {
  const fraction = useExport((s) => s.fraction)
  const step = useExport((s) => s.step)
  const remote = useExport((s) => s.remote && s.renderServer !== null)
  const label = remote || step !== 'encode' ? STEP_LABELS[step] : null
  const cancel = useExport((s) => s.cancel)
  const name = useExport((s) => s.name)

  return (
    <div className={styles.progress}>
      <div className={styles.progressHeader}>
        <span className={styles.progressName}>{name}.mp4</span>
        <span className={styles.progressValue}>
          <AnimatePresence initial={false} mode="popLayout">
            {label && (
              <motion.span
                key={label}
                className={styles.progressStep}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={quick}
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          <span className="mono">{Math.floor(fraction * 100)} %</span>
        </span>
      </div>
      <div className={styles.bar}>
        <motion.div className={styles.barFill} animate={{ width: `${fraction * 100}%` }} transition={{ duration: 0.2, ease: 'linear' }} />
      </div>
      <button className={styles.secondary} onClick={cancel}>
        Annuler
      </button>
    </div>
  )
}

function Done(): React.JSX.Element {
  const output = useExport((s) => s.output)
  const hide = useExport((s) => s.hide)

  return (
    <div className={styles.done}>
      <motion.span className={styles.check} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...quick, delay: 0.05 }}>
        <Icon name="check" size={18} />
      </motion.span>
      <span className={styles.doneName} title={output ?? ''}>
        {output ? fileName(output) : ''}.mp4
      </span>
      <div className={styles.doneActions}>
        <button className={styles.secondary} onClick={hide}>
          Fermer
        </button>
        <button
          className={styles.primary}
          autoFocus
          onClick={() => {
            if (output) void window.api.revealFile(output)
            hide()
          }}
        >
          Afficher dans {fileManager}
        </button>
      </div>
    </div>
  )
}
