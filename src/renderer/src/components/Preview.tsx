import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Segment } from '@shared/types'
import { FRAME, player, usePlayback } from '@/engine/player'
import { useLibrary } from '@/state/library'
import { useProject } from '@/state/project'
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
        <div className={styles.frame} style={{ aspectRatio: ratio, width: `min(100cqw, 100cqh * ${ratio.replace('/', ' / ')})` }}>
          <VideoLayers />
          <AnimatePresence>
            {empty && (
              <motion.div className={styles.placeholder} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                <Icon name="film" size={28} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Transport />
    </main>
  )
}

/** Format de l'image : celui du premier clip de la timeline, sinon 16:10 (l'écran d'un MacBook). */
function useAspectRatio(): string {
  const firstSource = useProject((s) => {
    const video = s.project.lanes.find((l) => l.kind === 'video')
    return s.project.segments.find((seg) => seg.laneId === video?.id)?.source
  })
  const details = useLibrary((s) => (firstSource ? s.details[firstSource] : undefined))
  return details && details.width > 0 ? `${details.width} / ${details.height}` : '16 / 10'
}

/**
 * Deux lecteurs vidéo qui se relaient : pendant que l'un affiche le morceau en cours, l'autre prépare le suivant,
 * pour passer d'un clip à l'autre sans image noire.
 */
function VideoLayers(): React.JSX.Element {
  const first = useRef<HTMLVideoElement>(null)
  const second = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let frame = 0
    const loop = (): void => {
      if (first.current && second.current) sync([first.current, second.current])
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <>
      <video ref={first} className={styles.video} muted playsInline preload="auto" />
      <video ref={second} className={styles.video} muted playsInline preload="auto" />
    </>
  )
}

function sync(videos: HTMLVideoElement[]): void {
  const time = player.time()
  const segments = player.videoSegments
  const index = segments.findIndex((s) => time >= s.start && time < s.start + s.duration)
  const current = segments[index]

  if (!current) {
    for (const video of videos) show(video, false)
    if (!player.playing) for (const video of videos) if (!video.paused) video.pause()
    return
  }

  const url = window.api.mediaURL(current.source)
  const target = sourceTime(current, time)
  const active = videos.find((v) => v.dataset.src === url) ?? videos.find((v) => v.dataset.visible !== 'true') ?? videos[0]
  const other = videos.find((v) => v !== active)!
  load(active, url, target)

  if (active.readyState >= 2) {
    show(active, true)
    show(other, false)
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

  // Prépare le morceau suivant sur le lecteur libre.
  const next = segments[index + 1]
  if (next && next.source !== current.source && next.start - time < 2) {
    load(other, window.api.mediaURL(next.source), next.sourceStart)
  }
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

function show(video: HTMLVideoElement, visible: boolean): void {
  video.dataset.visible = String(visible)
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
