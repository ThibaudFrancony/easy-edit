import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Lane, Project, Segment } from '@shared/types'
import { insertClip, projectDuration, segmentsIn, snapTimes } from '@shared/project'
import { player } from '@/engine/player'
import { clipDetails, thumbnailURL, useLibrary } from '@/state/library'
import { useProject } from '@/state/project'
import { LEADING_INSET, MAX_ZOOM, MIN_ZOOM, timeToX, useTimeline, xToTime } from '@/state/timeline'
import { clipTime, fileName } from '@/lib/format'
import { fade, standard } from '@/lib/motion'
import { CLIP_DRAG_TYPE } from '../Library'
import { Icon } from '../Icon'
import { Ruler } from './Ruler'
import styles from './Timeline.module.css'

/** Distance, en px à l'écran, sous laquelle un morceau s'aimante. */
const SNAP_DISTANCE = 8
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
  const [ghost, setGhost] = useState<Ghost | null>(null)

  const lanes = useMemo(() => [...project.lanes].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'video' ? -1 : 1)), [project.lanes])
  const duration = projectDuration(project)
  // 30 s de marge après le dernier morceau, pour pouvoir y déposer la suite.
  const contentWidth = Math.max(LEADING_INSET * 2 + (duration + 30) * pps, viewportWidth)

  useScrollSync(scrollRef)
  useWheelZoom(scrollRef)

  function dropPosition(clientX: number): Ghost | null {
    const scroller = scrollRef.current
    const dragged = useLibrary.getState().dragged
    if (!scroller || !dragged) return null
    const clipDuration = useLibrary.getState().details[dragged.path]?.duration ?? 30
    const x = clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft
    return snap(xToTime(x, pps), clipDuration, [...snapTimes(project), player.time()], SNAP_DISTANCE / pps)
  }

  return (
    <section className={styles.timeline}>
      <div className={styles.toolbar}>
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

        <div className={styles.rows}>
          <div className={styles.heads}>
            <AnimatePresence initial={false}>
              {lanes.map((lane) => (
                <motion.div
                  key={lane.id}
                  layout
                  className={styles.head}
                  style={{ height: LANE_HEIGHT[lane.kind] }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={standard}
                >
                  {lane.name}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div
            ref={scrollRef}
            className={styles.scroller}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(CLIP_DRAG_TYPE)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setGhost(dropPosition(event.clientX))
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGhost(null)
            }}
            onDrop={async (event) => {
              event.preventDefault()
              const path = event.dataTransfer.getData(CLIP_DRAG_TYPE)
              const position = dropPosition(event.clientX) ?? ghost
              setGhost(null)
              useLibrary.getState().setDragged(null)
              if (!path || !position) return
              const details = await clipDetails(path)
              useProject.getState().update((draft) => insertClip(draft, details, position.start))
            }}
          >
            <div className={styles.content} style={{ width: contentWidth }}>
              <AnimatePresence initial={false}>
                {lanes.map((lane) => (
                  <motion.div
                    key={lane.id}
                    layout
                    className={styles.lane}
                    style={{ height: LANE_HEIGHT[lane.kind] }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={standard}
                  >
                    <LaneSegments project={project} lane={lane} pps={pps} />
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
              {ghost?.snapAt !== null && ghost?.snapAt !== undefined && (
                <div className={styles.snapLine} style={{ left: timeToX(ghost.snapAt, pps) }} />
              )}
            </div>
          </div>
        </div>

        <Playhead />
      </div>
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

function LaneSegments({ project, lane, pps }: { project: Project; lane: Lane; pps: number }): React.JSX.Element {
  const segments = segmentsIn(project, lane.id)
  return (
    <AnimatePresence initial={false}>
      {segments.map((segment) => (
        <motion.div
          key={segment.id}
          className={`${styles.segment} ${lane.kind === 'video' ? styles.video : styles.audio}`}
          style={{ left: timeToX(segment.start, pps) + 1, width: Math.max(2, segment.duration * pps - 2) }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={standard}
        >
          {lane.kind === 'video' ? <VideoSegment segment={segment} /> : null}
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

function VideoSegment({ segment }: { segment: Segment }): React.JSX.Element {
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
        {segment.linkId && <Icon name="link" size={11} />}
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
