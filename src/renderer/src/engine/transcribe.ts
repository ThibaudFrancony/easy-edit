import type { TimedWord } from '@shared/captions'
import type { TranscribePhase } from '@shared/types'

// La transcription (Voz) tourne dans un processus à part, côté système (src/main/transcriber.ts) : ici on ne fait que
// préparer le son et suivre l'avancement.

export type { TranscribePhase }
/** fraction : 0..1, ou null si on ne sait pas mesurer l'avancement. */
export type TranscribeProgress = (phase: TranscribePhase, fraction: number | null) => void

const MODEL_RATE = 16000

/** Transcrit un son mono. Renvoie les mots, en secondes depuis le début de `samples`. */
export async function transcribe(samples: Float32Array, sampleRate: number, onProgress?: TranscribeProgress): Promise<TimedWord[]> {
  const off = window.api.onTranscribeProgress(({ phase, fraction }) => onProgress?.(phase, fraction))
  try {
    return await window.api.transcribe(await resample(samples, sampleRate))
  } finally {
    off()
  }
}

/** Rééchantillonnage à 16 kHz par le moteur audio du navigateur (avec filtrage, contrairement à une simple interpolation). */
async function resample(samples: Float32Array, sampleRate: number): Promise<Float32Array> {
  if (sampleRate === MODEL_RATE || samples.length === 0) return samples
  const length = Math.ceil((samples.length * MODEL_RATE) / sampleRate)
  const context = new OfflineAudioContext(1, length, MODEL_RATE)
  const buffer = context.createBuffer(1, samples.length, sampleRate)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
  return (await context.startRendering()).getChannelData(0)
}
