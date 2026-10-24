import { useLayoutEffect, useRef } from 'react'
import type { CaptionLook, CaptionWord, Transform } from '@shared/types'
import { NO_TRANSFORM } from '@shared/geometry'
import { onPreview, useCanvas } from '@/state/canvas'
import { captionStyle, visibleWords } from '@shared/captions'
import { usePlayback } from '@/engine/player'
import { useProject } from '@/state/project'
import styles from './Captions.module.css'

/**
 * Les sous-titres d'une piste vidéo, au temps de lecture, dans le calque de cette piste. Leur place réelle est mesurée
 * et notée pour le clic sur l'aperçu et les poignées de cadrage.
 */
export function LaneCaptions({ laneId }: { laneId: string }): React.JSX.Element {
  const time = usePlayback((s) => s.time)
  const lane = useProject((s) => s.project.lanes.find((l) => l.id === laneId))
  const segment = useProject((s) => s.project.segments.find((seg) => seg.laneId === laneId && seg.caption && time >= seg.start && time < seg.start + seg.duration))
  const area = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const box = area.current?.getBoundingClientRect()
    const text = line.current?.getBoundingClientRect()
    const previous = onPreview.get(laneId)
    if (segment && box && text && box.width > 0) {
      const rect = { x: (text.left - box.left) / box.width, y: (text.top - box.top) / box.height, width: text.width / box.width, height: text.height / box.height }
      const old = previous?.segment.id === segment.id ? previous.rect : undefined
      onPreview.set(laneId, { segment, mediaAspect: 0, rect })
      if (!old || Math.abs(old.x - rect.x) + Math.abs(old.y - rect.y) + Math.abs(old.width - rect.width) + Math.abs(old.height - rect.height) > 1e-4) {
        useCanvas.setState((s) => ({ measured: s.measured + 1 }))
      }
    } else if (previous?.segment.caption) {
      onPreview.delete(laneId)
      useCanvas.setState((s) => ({ measured: s.measured + 1 }))
    }
  })

  return (
    <div ref={area} className={styles.layer}>
      {segment && lane && !lane.muted && (
        <CaptionText look={lane.look} words={segment.caption?.words ?? []} time={time - segment.start} transform={segment.transform} lineRef={line} />
      )}
    </div>
  )
}

/** Un sous-titre dans un style ; sert aussi aux vignettes de l'inspecteur, grossies par `zoom` pour rester lisibles. */
export function CaptionText({
  look,
  words,
  time,
  zoom = 1,
  transform = NO_TRANSFORM,
  lineRef
}: {
  look: CaptionLook | undefined
  words: CaptionWord[]
  time: number
  zoom?: number
  /** Déplacement (x, y en fractions de l'image) et agrandissement réglés sur l'aperçu. */
  transform?: Transform
  lineRef?: React.Ref<HTMLSpanElement>
}): React.JSX.Element | null {
  const style = captionStyle(look?.style ?? 'classique')
  const shown = visibleWords(words, style.wordsShown, time)
  if (shown.words.length === 0) return null

  return (
    <div
      className={styles.caption}
      data-style={style.id}
      style={{
        top: `${(style.y + transform.y) * 100}%`,
        left: `${(0.07 + transform.x) * 100}%`,
        right: `${(0.07 - transform.x) * 100}%`,
        fontSize: `${style.size * 100 * zoom * transform.scale}cqh`,
        fontWeight: style.weight,
        ['--outline' as string]: `${style.outline}em`
      }}
    >
      <span ref={lineRef} className={styles.line}>
        {shown.words.map((word, index) => (
          <span key={index} style={index === shown.current && look?.accent ? { color: look.accent } : undefined}>
            {index > 0 ? ' ' : ''}
            {word.text}
          </span>
        ))}
      </span>
    </div>
  )
}
