import type { CaptionLook, CaptionWord, Lane, Segment } from '@shared/types'
import { captionStyle, visibleWords } from '@shared/captions'
import { usePlayback } from '@/engine/player'
import { useProject } from '@/state/project'
import styles from './Captions.module.css'

/** Les sous-titres par-dessus l'aperçu, au temps de lecture. Les tailles suivent la hauteur de l'image. */
export function CaptionLayer(): React.JSX.Element {
  const time = usePlayback((s) => s.time)
  const active = useProject((s) => activeCaptions(s.project.lanes, s.project.segments, time))

  return (
    <div className={styles.layer}>
      {active.map(({ lane, segment }) => (
        <CaptionText key={segment.id} look={lane.look} words={segment.caption?.words ?? []} time={time - segment.start} />
      ))}
    </div>
  )
}

// Comparaison superficielle : sans elle, le sélecteur renverrait un nouveau tableau à chaque image.
let previous: { lane: Lane; segment: Segment }[] = []

function activeCaptions(lanes: Lane[], segments: Segment[], time: number): { lane: Lane; segment: Segment }[] {
  const found: { lane: Lane; segment: Segment }[] = []
  for (const lane of lanes) {
    if (lane.kind !== 'caption' || lane.muted) continue
    const segment = segments.find((s) => s.laneId === lane.id && time >= s.start && time < s.start + s.duration)
    if (segment) found.push({ lane, segment })
  }
  const same = found.length === previous.length && found.every((f, i) => f.segment === previous[i]?.segment && f.lane === previous[i]?.lane)
  if (!same) previous = found
  return previous
}

/** Un sous-titre dans un style ; sert aussi aux vignettes de l'inspecteur, grossies par `zoom` pour rester lisibles. */
export function CaptionText({ look, words, time, zoom = 1 }: { look: CaptionLook | undefined; words: CaptionWord[]; time: number; zoom?: number }): React.JSX.Element | null {
  const style = captionStyle(look?.style ?? 'classique')
  const shown = visibleWords(words, style.wordsShown, time)
  if (shown.words.length === 0) return null

  return (
    <div
      className={styles.caption}
      data-style={style.id}
      style={{
        top: `${style.y * 100}%`,
        fontSize: `${style.size * 100 * zoom}cqh`,
        fontWeight: style.weight,
        ['--outline' as string]: `${style.outline}em`
      }}
    >
      <span className={styles.line}>
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
