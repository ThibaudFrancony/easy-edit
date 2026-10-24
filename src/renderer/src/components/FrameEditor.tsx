import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Crop, Segment, Transform } from '@shared/types'
import { NO_CROP, NO_TRANSFORM, type Rect, placement } from '@shared/geometry'
import { type FrameMode, beginFrameGesture, onPreview, resetFrame, setCrop, setTransform, useCanvas } from '@/state/canvas'
import { useLibrary } from '@/state/library'
import { usePlayback } from '@/engine/player'
import { useProject } from '@/state/project'
import { useTimeline } from '@/state/timeline'
import { quick, standard } from '@/lib/motion'
import styles from './FrameEditor.module.css'

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se']
const EDGES: Handle[] = ['n', 's', 'e', 'w']

/** Poignées de cadrage posées sur l'aperçu, au-dessus du morceau qu'on redimensionne ou qu'on rogne. */
export function FrameEditor(): React.JSX.Element {
  const editing = useCanvas((s) => s.editing)
  const segment = useProject((s) => (editing ? s.project.segments.find((seg) => seg.id === editing.segmentId) : undefined))

  return (
    <AnimatePresence>
      {editing && segment && <Editor key={segment.id} segment={segment} mode={editing.mode} />}
    </AnimatePresence>
  )
}

function Editor({ segment, mode }: { segment: Segment; mode: FrameMode }): React.JSX.Element {
  const overlay = useRef<HTMLDivElement>(null)
  const size = useSize(overlay)
  const details = useLibrary((s) => s.details[segment.source])
  const shown = onPreview.get(segment.laneId)
  const mediaAspect = shown?.segment.id === segment.id ? shown.mediaAspect : details && details.height > 0 ? details.width / details.height : size.width / size.height
  const textRect = useMeasuredCaption(segment)
  // Un sous-titre n'a pas de format de média : sa boîte est la place mesurée de son texte, et il ne se rogne pas.
  const { full, visible } = textRect ? { full: textRect, visible: textRect } : placement(mediaAspect, size.width / Math.max(1, size.height), segment)
  const drag = useHandleDrag(segment, segment.caption ? 'resize' : mode, full, size)

  return (
    <motion.div
      ref={overlay}
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={quick}
      onPointerDown={(event) => {
        // Un clic à côté du morceau termine le cadrage.
        if (event.target === event.currentTarget) useCanvas.getState().stopEditing()
      }}
    >
      {mode === 'crop' && <div className={styles.full} style={rectStyle(full)} />}
      <div className={styles.box} data-mode={mode} style={rectStyle(visible)} onPointerDown={drag.start('move')} onPointerMove={drag.move} onPointerUp={drag.end}>
        {(mode === 'resize' ? CORNERS : [...CORNERS, ...EDGES]).map((handle) => (
          <span key={handle} className={styles.handle} data-handle={handle} onPointerDown={drag.start(handle)} onPointerMove={drag.move} onPointerUp={drag.end} />
        ))}
      </div>
    </motion.div>
  )
}

/** Barre du cadrage : elle prend la place des commandes de lecture sous l'image, sans jamais la recouvrir. */
export function FrameToolbar({ segmentId, mode }: { segmentId: string; mode: FrameMode }): React.JSX.Element {
  // Un sous-titre se déplace et se redimensionne, mais ne se rogne pas.
  const caption = useProject((s) => Boolean(s.project.segments.find((seg) => seg.id === segmentId)?.caption))
  const modes: { value: FrameMode; label: string }[] = caption
    ? [{ value: 'resize', label: 'Redimensionner' }]
    : [
        { value: 'resize', label: 'Redimensionner' },
        { value: 'crop', label: 'Rogner' }
      ]
  return (
    <motion.div
      className={styles.toolbar}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
      transition={standard}
    >
      <div className={styles.segmented} role="radiogroup" aria-label="Cadrage">
        {modes.map((option) => (
          <button
            key={option.value}
            role="radio"
            aria-checked={mode === option.value}
            className={styles.segment}
            onClick={() => useCanvas.setState({ editing: { segmentId, mode: option.value } })}
          >
            {mode === option.value && <motion.span layoutId="frame-mode" className={styles.highlight} transition={quick} />}
            <span className={styles.label}>{option.label}</span>
          </button>
        ))}
      </div>
      <button className={styles.button} onClick={() => resetFrame(segmentId)}>
        Réinitialiser
      </button>
      <button className={styles.primary} onClick={() => useCanvas.getState().stopEditing()}>
        Terminé
      </button>
    </motion.div>
  )
}

function rectStyle(rect: Rect): React.CSSProperties {
  return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }
}

export function useSize(ref: React.RefObject<HTMLDivElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 16, height: 10 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

/**
 * Glissés sur la boîte et ses poignées. Redimensionner : la boîte se déplace, les coins changent la taille autour
 * du centre. Rogner : chaque bord retire une part du média de son côté.
 */
function useHandleDrag(segment: Segment, mode: FrameMode, full: Rect, size: { width: number; height: number }) {
  const origin = useRef<{ handle: Handle; x: number; y: number; transform: Transform; crop: Crop; full: Rect } | null>(null)

  return {
    start: (handle: Handle) => (event: React.PointerEvent) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      beginFrameGesture()
      origin.current = { handle, x: event.clientX, y: event.clientY, transform: segment.transform ?? NO_TRANSFORM, crop: segment.crop ?? NO_CROP, full }
    },
    move: (event: React.PointerEvent) => {
      const start = origin.current
      if (!start) return
      event.stopPropagation()
      const dx = (event.clientX - start.x) / size.width
      const dy = (event.clientY - start.y) / size.height
      const { handle, transform, crop } = start

      if (handle === 'move' && mode === 'resize') {
        setTransform(segment.id, { ...transform, x: transform.x + dx, y: transform.y + dy })
        return
      }
      if (mode === 'resize') {
        // Agrandir ou réduire autour du centre, selon l'éloignement du pointeur.
        const box = (event.currentTarget.parentElement?.parentElement ?? event.currentTarget).getBoundingClientRect()
        const centerX = box.left + (start.full.x + start.full.width / 2) * size.width
        const centerY = box.top + (start.full.y + start.full.height / 2) * size.height
        const before = Math.hypot(start.x - centerX, start.y - centerY)
        const after = Math.hypot(event.clientX - centerX, event.clientY - centerY)
        if (before > 2) setTransform(segment.id, { ...transform, scale: transform.scale * (after / before) })
        return
      }
      // Rogner : le déplacement est rapporté à la taille du média entier.
      const fx = dx / start.full.width
      const fy = dy / start.full.height
      const next = { ...crop }
      if (handle.includes('w')) next.left = crop.left + fx
      if (handle.includes('e')) next.right = crop.right - fx
      if (handle.includes('n')) next.top = crop.top + fy
      if (handle.includes('s')) next.bottom = crop.bottom - fy
      if (handle === 'move') {
        // Glisser l'intérieur en mode rognage déplace la fenêtre de rognage sans changer sa taille.
        const shiftX = Math.max(-crop.left, Math.min(crop.right, fx))
        const shiftY = Math.max(-crop.top, Math.min(crop.bottom, fy))
        Object.assign(next, { left: crop.left + shiftX, right: crop.right - shiftX, top: crop.top + shiftY, bottom: crop.bottom - shiftY })
      }
      setCrop(segment.id, next)
    },
    end: (event: React.PointerEvent) => {
      if (!origin.current) return
      event.stopPropagation()
      origin.current = null
    }
  }
}

/** Contour du morceau sélectionné, quand on le voit dans l'aperçu (hors cadrage). Ne capte jamais la souris. */
export function SelectionOutline(): React.JSX.Element {
  const area = useRef<HTMLDivElement>(null)
  const size = useSize(area)
  const editing = useCanvas((s) => s.editing)
  const selection = useTimeline((s) => s.selection)
  const project = useProject((s) => s.project)
  // Ce qui est visible change avec le temps : on suit le curseur de lecture, et la place mesurée des sous-titres.
  usePlayback((s) => s.time)
  useCanvas((s) => s.measured)

  const rects: { id: string; rect: Rect }[] = []
  if (!editing) {
    for (const [, shown] of onPreview) {
      if (!selection.has(shown.segment.id)) continue
      const segment = project.segments.find((s) => s.id === shown.segment.id)
      if (segment) rects.push({ id: segment.id, rect: shown.rect ?? placement(shown.mediaAspect, size.width / Math.max(1, size.height), segment).visible })
    }
  }

  return (
    <div ref={area} className={styles.outlineArea}>
      {rects.map(({ id, rect }) => (
        <div key={id} className={styles.outline} style={rectStyle(rect)} />
      ))}
    </div>
  )
}

/** La place mesurée du texte d'un sous-titre : elle dépend du texte, donc n'est connue qu'après son rendu. */
function useMeasuredCaption(segment: Segment): Rect | null {
  useCanvas((s) => s.measured)
  const shown = onPreview.get(segment.laneId)
  return segment.caption && shown?.segment.id === segment.id ? (shown.rect ?? null) : null
}
