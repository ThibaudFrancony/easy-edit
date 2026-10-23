import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Lane, Segment } from '@shared/types'
import { snapTimes, withLinked } from '@shared/project'
import { player } from '@/engine/player'
import { commitDrag } from '@/state/editing'
import { thumbnailURL, useLibrary } from '@/state/library'
import { useProject } from '@/state/project'
import { isInstantLayout, timeToX, useTimeline } from '@/state/timeline'
import { clipTime, fileName } from '@/lib/format'
import { fade, standard } from '@/lib/motion'
import { Icon } from '../Icon'
import { Waveform } from './Waveform'
import styles from './Timeline.module.css'

/** Distance, en px à l'écran, sous laquelle un morceau s'aimante. */
export const SNAP_DISTANCE = 8
/** Distance à parcourir avant qu'un clic devienne un déplacement. */
const DRAG_THRESHOLD = 3

interface SegmentViewProps {
  segment: Segment
  lane: Lane
  pps: number
  onContextMenu(x: number, y: number): void
}

export function SegmentView({ segment, lane, pps, onContextMenu }: SegmentViewProps): React.JSX.Element {
  const kind = lane.kind
  const selected = useTimeline((s) => s.selection.has(segment.id))
  const delta = useTimeline((s) => (s.drag?.ids.has(segment.id) ? s.drag.delta : 0))
  const dragging = useTimeline((s) => s.drag?.ids.has(segment.id) ?? false)
  const left = timeToX(segment.start + delta, pps) + 1
  const width = Math.max(2, segment.duration * pps - 2)
  const pointer = usePointerDrag(segment, pps)

  return (
    <motion.div
      className={`${styles.segment} ${kind === 'video' ? styles.video : lane.music ? styles.music : styles.audio}`}
      data-muted={lane.muted}
      data-selected={selected}
      data-dragging={dragging}
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0, left, width }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={dragging || isInstantLayout() ? { duration: 0 } : standard}
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const { selection, setSelection } = useTimeline.getState()
        if (!selection.has(segment.id)) setSelection(withLinked(useProject.getState().project, [segment.id]))
        onContextMenu(event.clientX, event.clientY)
      }}
    >
      {kind === 'video' ? (
        <VideoContent segment={segment} />
      ) : (
        <>
          <Waveform
            source={segment.source}
            stream={segment.stream}
            sourceStart={segment.sourceStart}
            duration={segment.duration}
            color={lane.music ? 'var(--music-wave)' : 'var(--audio-wave)'}
            gain={lane.volume}
          />
          {!segment.linkId && !lane.music && (
            <span className={styles.unlinked} title="Délié">
              <Icon name="unlink" size={11} />
            </span>
          )}
        </>
      )}
    </motion.div>
  )
}

function VideoContent({ segment }: { segment: Segment }): React.JSX.Element {
  const created = useLibrary((s) => s.clips.find((c) => c.path === segment.source)?.createdAt)
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    thumbnailURL(segment.source).then((url) => alive && setThumbnail(url), () => {})
    return () => {
      alive = false
    }
  }, [segment.source])

  return (
    <>
      <div className={styles.label}>
        <Icon name={segment.linkId ? 'link' : 'unlink'} size={11} />
        {created ? clipTime(created) : fileName(segment.source)}
      </div>
      <motion.div
        className={styles.filmstrip}
        style={{ backgroundImage: thumbnail ? `url("${thumbnail}")` : undefined }}
        initial={{ opacity: 0 }}
        animate={{ opacity: thumbnail ? 1 : 0 }}
        transition={fade}
      />
    </>
  )
}

/** Clic : sélection (le morceau et ceux qui lui sont liés ; ⇧ pour ajouter ou retirer). Glissé : déplacement aimanté. */
function usePointerDrag(segment: Segment, pps: number) {
  const start = useRef<{
    x: number
    ids: Set<string>
    snaps: number[]
    bounds: { start: number; end: number }[]
    /** Clic sur un morceau déjà sélectionné, sans ⇧ : s'il n'y a pas de glissé, il devient la seule sélection. */
    narrowOnRelease: boolean
  } | null>(null)

  return {
    onPointerDown(event: React.PointerEvent) {
      if (event.button !== 0) return
      event.stopPropagation()
      const project = useProject.getState().project
      const group = withLinked(project, [segment.id])
      const { selection, setSelection } = useTimeline.getState()
      let next = selection
      const narrowOnRelease = !event.shiftKey && selection.has(segment.id) && selection.size > group.size
      if (event.shiftKey) {
        next = new Set(selection)
        const all = [...group].every((id) => next.has(id))
        for (const id of group) {
          if (all) next.delete(id)
          else next.add(id)
        }
        setSelection(next)
      } else if (!selection.has(segment.id)) {
        next = group
        setSelection(next)
      }
      if (!next.has(segment.id)) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const moving = project.segments.filter((s) => next.has(s.id))
      start.current = {
        x: event.clientX,
        ids: new Set(next),
        snaps: [...snapTimes(project, next), player.time()],
        bounds: moving.map((s) => ({ start: s.start, end: s.start + s.duration })),
        narrowOnRelease
      }
    },
    onPointerMove(event: React.PointerEvent) {
      const origin = start.current
      if (!origin) return
      const dx = event.clientX - origin.x
      const { drag, setDrag } = useTimeline.getState()
      if (!drag && Math.abs(dx) < DRAG_THRESHOLD) return
      const raw = dx / pps
      const threshold = SNAP_DISTANCE / pps
      let best: { shift: number; at: number } | null = null
      for (const bound of origin.bounds) {
        for (const edge of [bound.start + raw, bound.end + raw]) {
          for (const time of origin.snaps) {
            const shift = time - edge
            if (Math.abs(shift) < threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: time }
          }
        }
      }
      const earliest = Math.min(...origin.bounds.map((b) => b.start))
      const delta = Math.max(-earliest, raw + (best?.shift ?? 0))
      setDrag({ ids: origin.ids, delta, snapAt: best ? best.at : null })
    },
    onPointerUp() {
      const origin = start.current
      start.current = null
      if (useTimeline.getState().drag) return commitDrag()
      if (origin?.narrowOnRelease) useTimeline.getState().setSelection(withLinked(useProject.getState().project, [segment.id]))
    }
  }
}
