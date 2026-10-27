import type { MotionBlur } from '@shared/types'

/** Un morceau à flouter : une plage d'un clip, décodée à `width`×`height`, écrite dans `output`. */
export interface BlurJob {
  ffmpeg: string
  model: string
  source: string
  sourceStart: number
  duration: number
  width: number
  height: number
  settings: MotionBlur
  output: string
}

/** Messages échangés avec le processus du flou de mouvement. */
export interface BlurIn {
  id: number
  job: BlurJob
}

export type BlurOut =
  | { id: number; kind: 'progress'; fraction: number }
  | { id: number; kind: 'done' }
  | { id: number; kind: 'error'; message: string }
