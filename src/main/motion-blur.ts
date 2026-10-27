import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { MotionBlur, Project, Segment } from '@shared/types'
import { blurIsActive } from '@shared/motion-blur'
import { segmentsIn, videoLanes } from '@shared/project'
import { cacheKey, cached, clipDetails, ffmpeg } from './media-tools'
import type { BlurIn, BlurJob, BlurModels, BlurOut } from './motion-blur-messages'
import { type WorkerProcess, runtime } from './runtime'

// Le flou de mouvement des pistes qui l'ont activé, calculé avant l'export : chaque morceau devient un fichier
// flouté, gardé en cache (le même morceau avec les mêmes réglages n'est jamais recalculé).

/** RIFE 4.22 lite (Practical-RIFE, licence MIT), converti en ONNX par vs-mlrt, et sa version pour la carte NVIDIA. */
const MODELS: BlurModels = { standard: 'rife-v4.22-lite.onnx', cuda: 'rife-v4.22-lite-cuda.onnx' }

const modelPaths = (): BlurModels => ({ standard: join(runtime.modelsFolder, MODELS.standard), cuda: join(runtime.modelsFolder, MODELS.cuda) })

interface Job {
  resolve(): void
  reject(error: Error): void
  onProgress(fraction: number): void
}

let child: WorkerProcess | null = null
const jobs = new Map<number, Job>()
let nextId = 1

const abortError = (): Error => Object.assign(new Error('Export annulé'), { name: 'AbortError' })

/** Le processus du flou, lancé à la première demande puis gardé (le modèle reste chargé). */
function worker(): WorkerProcess {
  if (child) return child
  const created = runtime.forkBlurWorker()
  created.onMessage((data) => {
    const message = data as BlurOut
    const job = jobs.get(message.id)
    if (!job) return
    if (message.kind === 'progress') return job.onProgress(message.fraction)
    jobs.delete(message.id)
    if (message.kind === 'done') job.resolve()
    else job.reject(new Error(message.message))
  })
  created.onExit(() => {
    child = null
    for (const job of jobs.values()) job.reject(stopping ? abortError() : new Error('Le calcul du motion blur s’est arrêté.'))
    jobs.clear()
    stopping = false
  })
  child = created
  return created
}

/** Le processus est arrêté exprès (annulation) : ses calculs en cours sont annulés, pas ratés. */
let stopping = false

function run(job: BlurJob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    jobs.set(id, { resolve, reject, onProgress })
    const message: BlurIn = { id, job }
    worker().postMessage(message)
  })
}

const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2)

/** Le morceau flouté (en cache), décodé au plus à `maxHeight` lignes : inutile de calculer plus fin que l'export. */
async function blurredSegment(segment: Segment, settings: MotionBlur, maxHeight: number, onProgress: (fraction: number) => void): Promise<string> {
  const details = await clipDetails(segment.source)
  const height = even(Math.min(details.height, maxHeight))
  const width = even((details.width * height) / details.height)
  const key = await cacheKey(segment.source, JSON.stringify([MODELS, segment.sourceStart, segment.duration, width, height, settings]))
  return cached('motion-blur', `${key}.mp4`, (output) =>
    run(
      { ffmpeg, models: modelPaths(), source: segment.source, sourceStart: segment.sourceStart, duration: segment.duration, width, height, settings, output },
      onProgress
    ).catch(async (error: Error) => {
      // Processus arrêté en plein calcul : il n'a pas pu effacer son fichier inachevé.
      await rm(output, { force: true })
      throw error
    })
  )
}

/**
 * Floute les morceaux vidéo des pistes qui ont un motion blur, l'un après l'autre. Renvoie, pour chaque morceau
 * concerné, le fichier flouté qui le remplace à l'export (il commence au début du morceau). `signal` l'annule.
 */
export async function prepareMotionBlur(
  project: Project,
  maxHeight: number,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<Map<string, string>> {
  // Les pistes de sous-titres n'ont pas de motion blur.
  const todo = videoLanes(project).flatMap((lane) =>
    !lane.look && blurIsActive(lane.motionBlur)
      ? segmentsIn(project, lane.id)
          .filter((s) => !s.image && !s.caption)
          .map((segment) => ({ segment, settings: lane.motionBlur! }))
      : []
  )
  const replacements = new Map<string, string>()
  // La progression d'ensemble suit la durée des morceaux.
  const total = todo.reduce((sum, item) => sum + item.segment.duration, 0)
  let done = 0
  const stop = (): void => stopMotionBlur()
  signal.addEventListener('abort', stop)
  try {
    for (const { segment, settings } of todo) {
      if (signal.aborted) throw abortError()
      const file = await blurredSegment(segment, settings, maxHeight, (fraction) => onProgress((done + fraction * segment.duration) / total))
      replacements.set(segment.id, file)
      done += segment.duration
    }
  } finally {
    signal.removeEventListener('abort', stop)
  }
  return replacements
}

/** Arrête le calcul en cours : ce qu'il calculait est annulé (erreur `AbortError`). */
export function stopMotionBlur(): void {
  if (!child) return
  stopping = true
  child.kill()
}
