import { type UtilityProcess, utilityProcess } from 'electron'
import type { TimedWord } from '@shared/captions'
import type { TranscribePhase } from '@shared/types'
import transcriberPath from './transcriber?modulePath'
import type { TranscriberIn, TranscriberOut } from './transcriber-messages'

interface Job {
  resolve(words: TimedWord[]): void
  reject(error: Error): void
  onProgress(phase: TranscribePhase, fraction: number | null): void
}

let child: UtilityProcess | null = null
const jobs = new Map<number, Job>()
let nextId = 1
// Une transcription à la fois : une seule instance du modèle (environ 1 Go en mémoire).
let queue: Promise<unknown> = Promise.resolve()

/** Le processus de transcription, lancé à la première demande puis gardé (le modèle reste chargé). */
function transcriber(): UtilityProcess {
  if (child) return child
  const created = utilityProcess.fork(transcriberPath, [], { serviceName: 'Easy Edit — Transcription' })
  created.on('message', (message: TranscriberOut) => {
    const job = jobs.get(message.id)
    if (!job) return
    if (message.kind === 'progress') return job.onProgress(message.phase, message.fraction)
    jobs.delete(message.id)
    if (message.kind === 'done') job.resolve(message.words)
    else job.reject(new Error(message.message))
  })
  created.on('exit', () => {
    // Tombé : la prochaine demande en relance un (le modèle sera relu depuis le cache disque).
    child = null
    for (const job of jobs.values()) job.reject(new Error('La transcription s’est arrêtée.'))
    jobs.clear()
  })
  child = created
  return created
}

/** Transcrit un son mono à 16 kHz ; les temps des mots sont en secondes depuis son début. */
export function transcribe(samples: Float32Array, onProgress: Job['onProgress']): Promise<TimedWord[]> {
  const run = queue.then(
    () =>
      new Promise<TimedWord[]>((resolve, reject) => {
        const id = nextId++
        jobs.set(id, { resolve, reject, onProgress })
        const message: TranscriberIn = { id, samples }
        transcriber().postMessage(message)
      })
  )
  queue = run.catch(() => {})
  return run
}

export function stopTranscriber(): void {
  child?.kill()
}
