import { player } from '@/engine/player'

/** Résolution des formes d'onde : une valeur de crête par centième de seconde. */
export const PEAKS_PER_SECOND = 100

/** Crêtes (0..1) d'un son : maximum absolu sur tous les canaux par tranche de 1/100 s, avec une courbe 0.6 pour que les sons faibles restent lisibles. */
export function computePeaks(buffer: AudioBuffer): Float32Array {
  const binSize = Math.max(1, Math.round(buffer.sampleRate / PEAKS_PER_SECOND))
  const bins = Math.ceil(buffer.length / binSize)
  // Accumulateur de maxima, transformé en place une fois tous les canaux lus.
  const peaks = new Float32Array(bins)

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let bin = 0; bin < bins; bin++) {
      const start = bin * binSize
      const end = Math.min(start + binSize, data.length)
      let max = peaks[bin]
      for (let i = start; i < end; i++) {
        const value = data[i]
        const abs = value < 0 ? -value : value
        if (abs > max) max = abs
      }
      peaks[bin] = max
    }
  }

  for (let bin = 0; bin < bins; bin++) {
    peaks[bin] = Math.min(1, Math.max(0, Math.pow(peaks[bin], 0.6)))
  }
  return peaks
}

/** Tracé SVG fermé de la forme d'onde, symétrique autour de y = 1 : x = index de la crête (0..n), haut y = 1 - p, bas y = 1 + p. Coordonnées arrondies à 3 décimales. */
export function waveformPath(peaks: Float32Array): string {
  const n = peaks.length
  const round = (value: number): number => Math.round(value * 1000) / 1000
  const parts: string[] = ['M0 1']

  for (let i = 0; i < n; i++) {
    parts.push(`L${i} ${round(1 - peaks[i])}`)
  }
  // Retour par le bas, de la fin vers le début, pour fermer la forme.
  for (let i = n - 1; i >= 0; i--) {
    parts.push(`L${i} ${round(1 + peaks[i])}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

// Une source peut être découpée en nombreux segments : on ne décode et n'analyse qu'une fois.
const cache = new Map<string, Promise<Float32Array | null>>()

/** Crêtes d'une piste source, calculées une seule fois puis gardées en mémoire (null si le son n'a pas pu être décodé). */
export function sourcePeaks(source: string, stream: number): Promise<Float32Array | null> {
  const key = `${source}|${stream}`
  let pending = cache.get(key)
  if (!pending) {
    pending = player
      .audioBuffer(source, stream)
      .then((buffer) => (buffer ? computePeaks(buffer) : null))
      .catch(() => null)
    cache.set(key, pending)
  }
  return pending
}
