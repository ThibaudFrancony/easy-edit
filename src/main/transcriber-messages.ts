import type { TimedWord } from '@shared/captions'
import type { TranscribePhase } from '@shared/types'

/** Messages échangés avec le processus de transcription. */
export interface TranscriberIn {
  id: number
  /** Son mono à 16 kHz. */
  samples: Float32Array
}

export type TranscriberOut =
  | { id: number; kind: 'progress'; phase: TranscribePhase; fraction: number | null }
  | { id: number; kind: 'done'; words: TimedWord[] }
  | { id: number; kind: 'error'; message: string }
