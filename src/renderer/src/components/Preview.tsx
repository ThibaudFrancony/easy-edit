import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Segment, Transform } from '@shared/types'
import { segmentsIn, videoLanes } from '@shared/project'
import { NO_CROP, NO_TRANSFORM, contains, placement } from '@shared/geometry'
import { beginFrameGesture, onPreview, setTransform, useCanvas } from '@/state/canvas'
import { FrameEditor, FrameToolbar, SelectionOutline } from './FrameEditor'
import { FRAME, player, usePlayback } from '@/engine/player'
import { useLibrary } from '@/state/library'
import { useProject } from '@/state/project'
import { useTimeline } from '@/state/timeline'
import { fade } from '@/lib/motion'
import { timecode } from '@/lib/format'
import { Icon } from './Icon'
import styles from './Preview.module.css'

/** Écart toléré entre la vidéo et l'horloge pendant la lecture avant de recaler l'image. */
const MAX_DRIFT = 0.12

export function Preview(): React.JSX.Element {
  const empty = useProject((s) => s.project.segments.length === 0)
  const ratio = useAspectRatio()

  return (
    <main className={styles.preview}>
      <div className={styles.stage}>
        <div
          className={styles.frame}
          style={{ aspectRatio: ratio, width: `min(100cqw, 100cqh * ${ratio.replace('/', ' / ')})` }}
          onPointerDown={moveOnPreview.down}
          onPointerMove={moveOnPreview.move}
          onPointerUp={moveOnPreview.up}
          onContextMenu={(event) => {
            event.preventDefault()
            const box = event.currentTarget.getBoundingClientRect()
            const segment = segmentAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, box.width / box.height)
            if (!segment) return
            useTimeline.getState().setSelection(new Set([segment.id]))
            useCanvas.getState().openMenu(event.clientX, event.clientY, segment.id)
          }}
        >
          <VideoLayers />
          <SelectionOutline />
          <FrameEditor />
          <AnimatePresence>
            {empty && (
              <motion.div className={styles.placeholder} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                <Icon name="film" size={28} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <BottomBar />
    </main>
  )
}

/**
 * Clic sur l'aperçu : sélectionne ce qui est visible sous le pointeur (la piste la plus haute d'abord) ;
 * en glissant, on le déplace dans l'image.
 */
const moveOnPreview = (() => {
  let drag: { id: string; x: number; y: number; width: number; height: number; transform: Transform; moved: boolean } | null = null
  const pointIn = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { box, segment: segmentAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, box.width / box.height) }
  }
  return {
    down(event: React.PointerEvent<HTMLDivElement>): void {
      if (event.button !== 0 || useCanvas.getState().editing) return
      const { box, segment } = pointIn(event)
      useTimeline.getState().setSelection(new Set(segment ? [segment.id] : []))
      if (!segment) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag = { id: segment.id, x: event.clientX, y: event.clientY, width: box.width, height: box.height, transform: segment.transform ?? NO_TRANSFORM, moved: false }
    },
    move(event: React.PointerEvent<HTMLDivElement>): void {
      if (!drag) {
        // Au survol, le curseur indique ce qu'on peut déplacer.
        if (!useCanvas.getState().editing) event.currentTarget.style.cursor = pointIn(event).segment ? 'move' : ''
        return
      }
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 3) return
      if (!drag.moved) beginFrameGesture()
      drag.moved = true
      setTransform(drag.id, { ...drag.transform, x: drag.transform.x + dx / drag.width, y: drag.transform.y + dy / drag.height })
    },
    up(): void {
      drag = null
    }
  }
})()

/** Le morceau visible sous le point (x, y en fractions de l'image), en partant de la piste la plus haute. */
function segmentAt(x: number, y: number, frameAspect: number): Segment | null {
  for (const lane of videoLanes(useProject.getState().project)) {
    const shown = onPreview.get(lane.id)
    if (shown && contains(placement(shown.mediaAspect, frameAspect, shown.segment).visible, x, y)) return shown.segment
  }
  return null
}

/** Format de l'image : celui du premier clip de la piste vidéo la plus basse qui en a un, sinon 16:10 (l'écran d'un MacBook). */
function useAspectRatio(): string {
  const firstSource = useProject((s) => {
    for (const lane of [...videoLanes(s.project)].reverse()) {
      const segment = segmentsIn(s.project, lane.id)[0]
      if (segment) return segment.source
    }
    return undefined
  })
  const details = useLibrary((s) => (firstSource ? s.details[firstSource] : undefined))
  return details && details.width > 0 ? `${details.width} / ${details.height}` : '16 / 10'
}

/** Un calque par piste vidéo, du bas vers le haut : la piste la plus haute de la timeline passe par-dessus. */
function VideoLayers(): React.JSX.Element {
  // Une chaîne plutôt qu'un tableau : on ne refait le rendu que si les pistes vidéo changent vraiment.
  const laneIds = useProject((s) => videoLanes(s.project).map((l) => l.id).reverse().join(' '))
  return (
    <>
      {laneIds.split(' ').filter(Boolean).map((laneId) => (
        <LaneLayer key={laneId} laneId={laneId} />
      ))}
    </>
  )
}

/**
 * Le calque d'une piste : deux lecteurs vidéo qui se relaient (pendant que l'un affiche le morceau en cours,
 * l'autre prépare le suivant, sans image noire) et une image fixe. Là où la piste est vide, le calque est
 * transparent et laisse voir ceux du dessous.
 */
function LaneLayer({ laneId }: { laneId: string }): React.JSX.Element {
  const layer = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLVideoElement>(null)
  const second = useRef<HTMLVideoElement>(null)
  const still = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let frame = 0
    const loop = (): void => {
      if (layer.current && first.current && second.current && still.current) {
        sync(laneId, layer.current, [first.current, second.current], still.current)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      onPreview.delete(laneId)
    }
  }, [laneId])

  return (
    <div ref={layer} className={styles.layer}>
      <video ref={first} className={styles.video} muted playsInline preload="auto" />
      <video ref={second} className={styles.video} muted playsInline preload="auto" />
      <img ref={still} className={styles.video} alt="" draggable={false} />
    </div>
  )
}

function sync(laneId: string, layer: HTMLElement, videos: HTMLVideoElement[], still: HTMLImageElement): void {
  const time = player.time()
  const segments = player.laneSegments(laneId)
  const index = segments.findIndex((s) => time >= s.start && time < s.start + s.duration)
  const current = segments[index]
  const frameAspect = layer.clientWidth / Math.max(1, layer.clientHeight)

  if (!current || current.image) {
    for (const video of videos) {
      show(video, false)
      if (!video.paused) video.pause()
    }
    if (current) {
      const url = window.api.mediaURL(current.source)
      if (still.dataset.src !== url) {
        still.dataset.src = url
        still.src = url
      }
    }
    const ready = Boolean(current) && still.complete && still.naturalWidth > 0
    show(still, ready)
    if (current && ready) place(laneId, still, current, still.naturalWidth / still.naturalHeight, frameAspect)
    else onPreview.delete(laneId)
    preloadNext(segments[index + 1], current, time, videos)
    return
  }
  show(still, false)

  const url = window.api.mediaURL(current.source)
  const target = sourceTime(current, time)
  const active = videos.find((v) => v.dataset.src === url) ?? videos.find((v) => v.dataset.visible !== 'true') ?? videos[0]
  const other = videos.find((v) => v !== active)!
  load(active, url, target)

  if (active.readyState >= 2) {
    show(active, true)
    show(other, false)
    place(laneId, active, current, active.videoWidth / Math.max(1, active.videoHeight), frameAspect)
  }

  if (player.playing && usePlayback.getState().rate === 1) {
    if (active.paused) void active.play().catch(() => {})
    if (!active.seeking && Math.abs(active.currentTime - target) > MAX_DRIFT) active.currentTime = target
  } else {
    if (!active.paused) active.pause()
    // À l'arrêt, en avance rapide ou à reculons : on affiche l'image exacte, une recherche à la fois.
    if (!active.seeking && Math.abs(active.currentTime - target) > FRAME / 2) active.currentTime = target
  }
  if (!other.paused) other.pause()
  preloadNext(segments[index + 1], current, time, [other])
}

/** Prépare le prochain morceau vidéo sur un lecteur libre, pour l'enchaîner sans attente. */
function preloadNext(next: Segment | undefined, current: Segment | undefined, time: number, free: HTMLVideoElement[]): void {
  if (!next || next.image || next.source === current?.source || next.start - time > 2) return
  const video = free.find((v) => v.dataset.visible !== 'true')
  if (video) load(video, window.api.mediaURL(next.source), next.sourceStart)
}

function sourceTime(segment: Segment, time: number): number {
  return segment.sourceStart + (time - segment.start)
}

function load(video: HTMLVideoElement, url: string, time: number): void {
  if (video.dataset.src === url) return
  video.dataset.src = url
  video.src = url
  video.currentTime = time
}

/** Place le média selon son cadrage (taille, position, rognage) ; ne touche au style que si quelque chose a changé. */
function place(laneId: string, element: HTMLElement, segment: Segment, mediaAspect: number, frameAspect: number): void {
  onPreview.set(laneId, { segment, mediaAspect })
  const { full } = placement(mediaAspect, frameAspect, segment)
  const crop = segment.crop ?? NO_CROP
  const percent = (value: number): string => `${(value * 100).toFixed(3)}%`
  const key = [full.x, full.y, full.width, full.height, crop.left, crop.top, crop.right, crop.bottom].join(' ')
  if (element.dataset.placement === key) return
  element.dataset.placement = key
  Object.assign(element.style, {
    left: percent(full.x),
    top: percent(full.y),
    width: percent(full.width),
    height: percent(full.height),
    clipPath: `inset(${percent(crop.top)} ${percent(crop.right)} ${percent(crop.bottom)} ${percent(crop.left)})`
  })
}

function show(element: HTMLElement, visible: boolean): void {
  element.dataset.visible = String(visible)
}

/** Sous l'image : les commandes de lecture, ou la barre de cadrage pendant qu'on redimensionne ou rogne. */
function BottomBar(): React.JSX.Element {
  const editing = useCanvas((s) => s.editing)
  const exists = useProject((s) => Boolean(editing && s.project.segments.some((seg) => seg.id === editing.segmentId)))
  return (
    <div className={styles.bottom}>
      <AnimatePresence mode="wait" initial={false}>
        {editing && exists ? (
          <FrameToolbar key="cadrage" segmentId={editing.segmentId} mode={editing.mode} />
        ) : (
          <motion.div key="lecture" className={styles.bottomInner} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }} transition={fade}>
            <Transport />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Transport(): React.JSX.Element {
  const time = usePlayback((s) => s.time)
  const duration = usePlayback((s) => s.duration)
  const playing = usePlayback((s) => s.rate !== 0)

  return (
    <div className={styles.transport}>
      <div className={`${styles.timecode} mono`}>
        {timecode(time)} <span className={styles.duration}>/ {timecode(duration)}</span>
      </div>
      <div className={styles.controls}>
        <button className="icon-button" aria-label="Image précédente" onClick={() => player.step(-1)} disabled={duration === 0}>
          <Icon name="frame-back" />
        </button>
        <button className={styles.play} aria-label={playing ? 'Pause' : 'Lecture'} onClick={() => player.toggle()} disabled={duration === 0}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={playing ? 'pause' : 'play'}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.15 }}
              className={styles.playIcon}
            >
              <Icon name={playing ? 'pause' : 'play'} filled />
            </motion.span>
          </AnimatePresence>
        </button>
        <button className="icon-button" aria-label="Image suivante" onClick={() => player.step(1)} disabled={duration === 0}>
          <Icon name="frame-forward" />
        </button>
      </div>
      <div className={styles.spacer} />
    </div>
  )
}
