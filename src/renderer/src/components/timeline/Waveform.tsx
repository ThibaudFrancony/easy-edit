import { useEffect, useMemo, useState, type JSX } from 'react'
import { motion } from 'motion/react'
import { PEAKS_PER_SECOND, sourcePeaks, waveformPath } from '@/engine/waveform'
import { fade } from '@/lib/motion'

interface WaveformProps {
  source: string
  stream: number
  /** Partie de la source affichée par le morceau, en secondes. */
  sourceStart: number
  duration: number
  color: string
  /** Volume de la piste (0 à 2) : l'onde grandit ou rapetisse avec lui. */
  gain?: number
}

// Plusieurs segments partagent souvent la même source : le tracé n'est construit qu'une fois.
const pathCache = new WeakMap<Float32Array, string>()

function pathFor(peaks: Float32Array): string {
  let d = pathCache.get(peaks)
  if (d === undefined) {
    d = waveformPath(peaks)
    pathCache.set(peaks, d)
  }
  return d
}

export function Waveform({ source, stream, sourceStart, duration, color, gain = 1 }: WaveformProps): JSX.Element | null {
  const key = `${source}|${stream}`
  // Résultat rattaché à sa clé : un résultat d'une ancienne source n'est jamais affiché.
  const [loaded, setLoaded] = useState<{ key: string; peaks: Float32Array | null } | null>(null)

  useEffect(() => {
    let active = true
    sourcePeaks(source, stream).then((peaks) => {
      if (active) setLoaded({ key, peaks })
    })
    return () => {
      active = false
    }
  }, [key, source, stream])

  const peaks = loaded?.key === key ? loaded.peaks : null
  const d = useMemo(() => (peaks ? pathFor(peaks) : ''), [peaks])

  if (!peaks) return null

  return (
    <motion.svg
      aria-hidden
      viewBox={`${sourceStart * PEAKS_PER_SECOND} 0 ${duration * PEAKS_PER_SECOND} 2`}
      preserveAspectRatio="none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fade}
      // Le parent doit être positionné ; le SVG ne capte jamais la souris.
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {/* Mise à l'échelle autour de la ligne médiane (y = 1) ; au-delà de la hauteur, l'onde est simplement rognée. */}
      <motion.g
        initial={false}
        animate={{ scaleY: gain }}
        transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
        style={{ originY: 0.5, transformBox: 'view-box' }}
      >
        <path d={d} fill={color} />
      </motion.g>
    </motion.svg>
  )
}
