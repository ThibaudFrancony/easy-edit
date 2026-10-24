import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Lane, Project } from '@shared/types'
import { insertClip, projectDuration, segmentsIn, snapTimes } from '@shared/project'
import { player } from '@/engine/player'
import { clipDetails, useLibrary } from '@/state/library'
import { useProject } from '@/state/project'
import { LEADING_INSET, MAX_ZOOM, MIN_ZOOM, timeToX, useTimeline, xToTime } from '@/state/timeline'
import { fade, quick, standard } from '@/lib/motion'
import { addAudioFiles, addEmptyLane, normalizeLanes } from '@/state/editing'
import { CLIP_DRAG_TYPE, droppedAudioPaths } from '../Library'
import { Icon } from '../Icon'
import { ContextMenu, type MenuPosition } from './ContextMenu'
import { Ruler } from './Ruler'
import { SNAP_DISTANCE, SegmentView } from './SegmentView'
import styles from './Timeline.module.css'

const LANE_HEIGHT = { video: 66, audio: 40 } as const

interface Ghost {
  start: number
  duration: number
  snapAt: number | null
}

export function Timeline(): React.JSX.Element {
  const project = useProject((s) => s.project)
  const pps = useTimeline((s) => s.pixelsPerSecond)
  const scrollLeft = useTimeline((s) => s.scrollLeft)
  const viewportWidth = useTimeline((s) => s.viewportWidth)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [menu, setMenu] = useState<MenuPosition | null>(null)
  /** Fichiers audio glissés depuis le Finder : l'instant où ils seront posés. */
  const [fileDrop, setFileDrop] = useState<number | null>(null)
  const inspected = useTimeline((s) => s.inspectedLane)
  const hasAudio = project.lanes.some((l) => l.kind === 'audio')
  const dragSnap = useTimeline((s) => s.drag?.snapAt ?? null)
  const snapAt = ghost?.snapAt ?? dragSnap

  const lanes = useMemo(() => [...project.lanes].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'video' ? -1 : 1)), [project.lanes])
  const duration = projectDuration(project)
  // 30 s de marge après le dernier morceau, pour pouvoir y déposer la suite.
  const contentWidth = Math.max(LEADING_INSET * 2 + (duration + 30) * pps, viewportWidth)

  useScrollSync(scrollRef)
  useRevealNewLane(rowsRef, lanes.length)
  useWheelZoom(scrollRef)

  function dropPosition(clientX: number): Ghost | null {
    const scroller = scrollRef.current
    const dragged = useLibrary.getState().dragged
    if (!scroller || !dragged) return null
    const clipDuration = useLibrary.getState().details[dragged.path]?.duration ?? 30
    const x = clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft
    return snap(xToTime(x, pps), clipDuration, [...snapTimes(project), player.time()], SNAP_DISTANCE / pps)
  }

  function fileDropTime(clientX: number): number {
    const scroller = scrollRef.current!
    const x = clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft
    return snap(xToTime(x, pps), 0, [...snapTimes(project), player.time()], SNAP_DISTANCE / pps).start
  }

  return (
    <section className={styles.timeline}>
      <div className={styles.toolbar}>
        <NormalizeButton disabled={!hasAudio} />
        <div className={styles.grow} />
        <ZoomControl />
      </div>

      <div className={styles.body}>
        <div className={styles.rulerRow}>
          <div className={styles.corner} />
          <div className={styles.ruler}>
            <Ruler pixelsPerSecond={pps} scrollLeft={scrollLeft} leadingInset={LEADING_INSET} onScrub={(t) => player.seek(t)} />
          </div>
        </div>

        <div ref={rowsRef} className={styles.rows}>
          <div className={styles.heads}>
            <AnimatePresence initial={false}>
              {lanes.map((lane) => (
                <motion.button
                  key={lane.id}
                  layout
                  className={styles.head}
                  data-kind={lane.kind}
                  data-inspected={inspected === lane.id}
                  style={{ height: LANE_HEIGHT[lane.kind] }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={standard}
                  onClick={() => {
                    if (lane.kind === 'audio') useTimeline.getState().inspect(inspected === lane.id ? null : lane.id)
                  }}
                >
                  <span className={styles.headName}>{lane.name}</span>
                  <AnimatePresence>
                    {lane.muted && (
                      <motion.span className={styles.headMuted} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={quick}>
                        <Icon name="speaker-off" size={13} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </AnimatePresence>
            <motion.button
              layout
              className={styles.addLane}
              aria-label="Ajouter une piste"
              title="Ajouter une piste"
              transition={standard}
              onClick={addEmptyLane}
            >
              <Icon name="plus" size={14} />
            </motion.button>
          </div>

          <div
            ref={scrollRef}
            className={styles.scroller}
            onDragOver={(event) => {
              const types = event.dataTransfer.types
              if (types.includes(CLIP_DRAG_TYPE)) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setGhost(dropPosition(event.clientX))
              } else if (types.includes('Files')) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setFileDrop(fileDropTime(event.clientX))
              }
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setGhost(null)
              setFileDrop(null)
            }}
            onDrop={async (event) => {
              event.preventDefault()
              setFileDrop(null)
              const laneId = (event.target as HTMLElement).closest<HTMLElement>('[data-lane-id]')?.dataset.laneId
              if (event.dataTransfer.files.length > 0 && !event.dataTransfer.types.includes(CLIP_DRAG_TYPE)) {
                // Un son venu du Finder est d'abord copié dans la bibliothèque : le projet n'en dépend plus.
                const time = fileDropTime(event.clientX)
                const imported = await useLibrary.getState().importSounds(droppedAudioPaths(event))
                if (imported.length > 0) await addAudioFiles(imported, time, laneId)
                return
              }
              const path = event.dataTransfer.getData(CLIP_DRAG_TYPE)
              const position = dropPosition(event.clientX) ?? ghost
              setGhost(null)
              useLibrary.getState().setDragged(null)
              if (!path || !position) return
              const details = await clipDetails(path)
              // Un son de la bibliothèque va sur la piste de fond sonore visée, sinon sur une nouvelle.
              if (details.videoStream === null) await addAudioFiles([path], position.start, laneId)
              else useProject.getState().update((draft) => insertClip(draft, details, position.start))
            }}
          >
            <div
              className={styles.content}
              style={{ width: contentWidth }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                useTimeline.getState().setSelection(new Set())
                useTimeline.getState().inspect(null)
              }}
            >
              <AnimatePresence initial={false}>
                {lanes.map((lane) => (
                  <motion.div
                    key={lane.id}
                    layout
                    className={styles.lane}
                    data-lane-id={lane.id}
                    style={{ height: LANE_HEIGHT[lane.kind] }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={standard}
                  >
                    <LaneSegments project={project} lane={lane} pps={pps} onContextMenu={(x, y) => setMenu({ x, y })} />
                  </motion.div>
                ))}
              </AnimatePresence>

              <AnimatePresence>
                {ghost && (
                  <motion.div
                    className={styles.ghost}
                    style={{ left: timeToX(ghost.start, pps), width: ghost.duration * pps }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={fade}
                  />
                )}
              </AnimatePresence>
              {snapAt !== null && <div className={styles.snapLine} style={{ left: timeToX(snapAt, pps) }} />}
              {fileDrop !== null && <div className={styles.dropMarker} style={{ left: timeToX(fileDrop, pps) }} />}
            </div>
          </div>
        </div>

        <Playhead />
      </div>
      <ContextMenu position={menu} onClose={() => setMenu(null)} />
    </section>
  )
}

/** Aimante le début ou la fin d'un morceau à l'instant le plus proche, s'il est assez près. */
function snap(start: number, duration: number, times: number[], threshold: number): Ghost {
  let best: { delta: number; at: number } | null = null
  for (const time of times) {
    for (const delta of [time - start, time - (start + duration)]) {
      if (Math.abs(delta) < threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: time }
    }
  }
  return { start: Math.max(0, start + (best?.delta ?? 0)), duration, snapAt: best?.at ?? null }
}

function LaneSegments({ project, lane, pps, onContextMenu }: { project: Project; lane: Lane; pps: number; onContextMenu(x: number, y: number): void }): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {segmentsIn(project, lane.id).map((segment) => (
        <SegmentView key={segment.id} segment={segment} lane={lane} pps={pps} onContextMenu={onContextMenu} />
      ))}
    </AnimatePresence>
  )
}

/** Le curseur de lecture : déplacé directement à chaque image, sans repasser par React. */
function Playhead(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const loop = (): void => {
      const { pixelsPerSecond, scrollLeft, viewportWidth, scrollTo } = useTimeline.getState()
      const x = timeToX(player.time(), pixelsPerSecond) - scrollLeft
      if (ref.current) {
        ref.current.style.transform = `translateX(${x}px)`
        ref.current.style.opacity = x < -8 || x > viewportWidth + 8 ? '0' : '1'
      }
      // Pendant la lecture, la timeline suit le curseur.
      if (player.playing && (x > viewportWidth - 40 || x < 0)) scrollTo(scrollLeft + x - 40, true)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className={styles.playheadArea}>
      <div ref={ref} className={styles.playhead}>
        <div className={styles.playheadHandle} />
        <div className={styles.playheadLine} />
      </div>
    </div>
  )
}

function ZoomControl(): React.JSX.Element {
  const pps = useTimeline((s) => s.pixelsPerSecond)
  const zoomTo = useTimeline((s) => s.zoomTo)
  // Curseur logarithmique : chaque cran multiplie le zoom par le même facteur.
  const toSlider = (value: number): number => Math.log(value / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)
  const fromSlider = (value: number): number => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, value)

  return (
    <div className={styles.zoom}>
      <button className="icon-button" aria-label="Zoom arrière" onClick={() => zoomTo(pps / 1.5, player.time())}>
        <Icon name="minus" size={14} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={toSlider(pps)}
        aria-label="Zoom"
        className={styles.zoomSlider}
        style={{ ['--fill' as string]: `${toSlider(pps) * 100}%` }}
        onChange={(event) => zoomTo(fromSlider(Number(event.target.value)), player.time())}
      />
      <button className="icon-button" aria-label="Zoom avant" onClick={() => zoomTo(pps * 1.5, player.time())}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

/** Tient le store au courant du défilement et applique les demandes de défilement (zoom, suivi du curseur). */
function useScrollSync(scrollRef: React.RefObject<HTMLDivElement | null>): void {
  const request = useTimeline((s) => s.scrollRequest)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const report = (): void => useTimeline.getState().setViewport(element.scrollLeft, element.clientWidth)
    const observer = new ResizeObserver(report)
    observer.observe(element)
    element.addEventListener('scroll', report, { passive: true })
    report()
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', report)
    }
  }, [scrollRef])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || !request) return
    element.scrollTo({ left: request.left, behavior: request.smooth ? 'smooth' : 'instant' })
    useTimeline.setState({ scrollRequest: null })
  }, [request, scrollRef])
}

/** Pincement du trackpad (ou ⌘ + molette) : zoom centré sous le pointeur. */
function useWheelZoom(scrollRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const { pixelsPerSecond, zoomTo } = useTimeline.getState()
      const x = event.clientX - element.getBoundingClientRect().left + element.scrollLeft
      zoomTo(pixelsPerSecond * Math.exp(-event.deltaY * 0.01), xToTime(x, pixelsPerSecond))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [scrollRef])
}


/** Normalisation ponctuelle : un clic, les pistes incluses sont mises au même niveau (annulable avec ⌘Z). */
function NormalizeButton({ disabled }: { disabled: boolean }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  return (
    <button
      className={styles.toolButton}
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true)
        try {
          await normalizeLanes()
        } finally {
          setBusy(false)
        }
      }}
    >
      <motion.span style={{ display: 'flex' }} animate={busy ? { scaleY: [1, 0.6, 1] } : { scaleY: 1 }} transition={busy ? { duration: 0.6, repeat: Infinity } : quick}>
        <Icon name="levels" size={14} />
      </motion.span>
      Normaliser
    </button>
  )
}

/** Quand une piste s'ajoute en bas, la timeline défile en douceur pour la montrer. */
function useRevealNewLane(rowsRef: React.RefObject<HTMLDivElement | null>, laneCount: number): void {
  const previous = useRef(laneCount)
  useEffect(() => {
    const grew = laneCount > previous.current
    previous.current = laneCount
    if (!grew) return
    // Après l'animation d'apparition de la piste, pour défiler jusqu'à sa vraie position.
    const timer = setTimeout(() => {
      const rows = rowsRef.current
      rows?.scrollTo({ top: rows.scrollHeight, behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(timer)
  }, [laneCount, rowsRef])
}
