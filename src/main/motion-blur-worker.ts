// Processus utilitaire du flou de mouvement (lancé par motion-blur.ts) : FFmpeg décode le clip en images RGB, RIFE
// (onnxruntime-node, sur la puce graphique quand c'est possible) calcule les images intermédiaires, on les mélange,
// et un second FFmpeg encode le résultat. Tout se fait image par image : la mémoire reste petite.
import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import type { Readable } from 'node:stream'
import * as ort from 'onnxruntime-node'
import { BLUR_SOURCE_FPS, blurSamples } from '@shared/motion-blur'
import type { BlurIn, BlurJob, BlurOut } from './motion-blur-messages'

// Lancé par l'app (utilityProcess : `process.parentPort`) ou par le service de rendu (child_process : `process.send`).
const fromApp = 'parentPort' in process && process.parentPort !== undefined
const post = (message: BlurOut): void => (fromApp ? process.parentPort.postMessage(message) : void process.send?.(message))
const onMessage = (listener: (message: BlurIn) => void): void => {
  if (fromApp) process.parentPort.on('message', (event) => listener(event.data as BlurIn))
  else process.on('message', (message) => listener(message as BlurIn))
}

// ——— Modèle ———

/** CoreML : programme ML (puce graphique et Neural Engine) avec une taille d'image fixée d'avance. */
const COREML_FLAGS = 0x010 | 0x008

const GPU_PROVIDERS: Record<string, ort.InferenceSession.ExecutionProviderConfig[]> = {
  darwin: [{ name: 'coreml', coreMlFlags: COREML_FLAGS }, 'webgpu'],
  win32: ['dml'],
  // Le service de rendu sur le PC Linux (carte NVIDIA, bibliothèques CUDA dans LD_LIBRARY_PATH).
  linux: ['cuda']
}

let current: { key: string; session: Promise<ort.InferenceSession> } | null = null

/**
 * Une session RIFE pour cette taille d'image, gardée tant que la taille ne change pas. Chaque moteur graphique
 * disponible est essayé sur une image ; on garde le plus rapide, le processeur seulement si aucun ne marche.
 */
function session(model: string, width: number, height: number): Promise<ort.InferenceSession> {
  const key = `${model}|${width}x${height}`
  if (current?.key === key) return current.session
  const previous = current
  const created = (async () => {
    await (await previous?.session.catch(() => null))?.release()
    const options: ort.InferenceSession.SessionOptions = {
      graphOptimizationLevel: 'all',
      freeDimensionOverrides: { batch: 1, height, width }
    }
    let best: { session: ort.InferenceSession; ms: number } | null = null
    for (const provider of GPU_PROVIDERS[process.platform] ?? []) {
      try {
        // DirectML ne sait pas exécuter le graphe en parallèle ni réutiliser un plan mémoire.
        const dml = provider === 'dml' ? { enableMemPattern: false, executionMode: 'sequential' as const } : {}
        const candidate = await ort.InferenceSession.create(model, { ...options, ...dml, executionProviders: [provider] })
        const ms = await benchmark(candidate, width, height)
        if (best && best.ms <= ms) await candidate.release()
        else {
          await best?.session.release()
          best = { session: candidate, ms }
        }
      } catch {
        // Ce moteur n'est pas disponible sur cette machine : on essaie le suivant.
      }
    }
    return best?.session ?? ort.InferenceSession.create(model, { ...options, executionProviders: ['cpu'] })
  })()
  current = { key, session: created }
  created.catch(() => (current = null))
  return created
}

/** Durée d'une image intermédiaire, mesurée au deuxième passage (le premier prépare le moteur). */
async function benchmark(candidate: ort.InferenceSession, width: number, height: number): Promise<number> {
  const input = new ort.Tensor('float32', new Float32Array(7 * width * height).fill(0.5), [1, 7, height, width])
  await candidate.run({ input })
  const start = performance.now()
  await candidate.run({ input })
  return performance.now() - start
}

// ——— Images ———

/** Les images RGB d'un flux FFmpeg, une à une. */
async function* frames(stream: Readable, size: number): AsyncGenerator<Uint8Array> {
  let frame = new Uint8Array(size)
  let filled = 0
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let offset = 0
    while (offset < chunk.length) {
      const count = Math.min(size - filled, chunk.length - offset)
      frame.set(chunk.subarray(offset, offset + count), filled)
      filled += count
      offset += count
      if (filled === size) {
        yield frame
        frame = new Uint8Array(size)
        filled = 0
      }
    }
  }
}

/** Deux images identiques (une image répétée d'un clip à cadence variable) : rien à interpoler entre elles. */
function identical(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i += 61) if (Math.abs(a[i]! - b[i]!) > 2) return false
  return true
}

/** FFmpeg, qui reçoit des images sur son entrée (`stdin`) ou en sort sur sa sortie (`stdout`). */
function ffmpegProcess(path: string, args: string[], pipe: 'stdin' | 'stdout'): ChildProcess {
  return spawn(path, ['-hide_banner', '-v', 'error', ...args], {
    stdio: [pipe === 'stdin' ? 'pipe' : 'ignore', pipe === 'stdout' ? 'pipe' : 'ignore', 'pipe']
  })
}

/** Attend la fin de FFmpeg ; une erreur porte ses dernières lignes. */
function finished(child: ChildProcess): Promise<void> {
  let stderr = ''
  child.stderr!.setEncoding('utf8')
  child.stderr!.on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-2000)))
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      // Arrêté par nous (le décodeur, une fois les images utiles lues) : ce n'est pas une erreur.
      if (code === 0 || child.killed) resolve()
      else reject(new Error(stderr.trim().split('\n').slice(-2).join('\n') || `FFmpeg s'est arrêté (code ${code})`))
    })
  })
}

// ——— Flou ———

async function blur(id: number, job: BlurJob): Promise<void> {
  const { width, height, settings } = job
  const pixels = width * height
  const rife = await session(job.model, width, height)
  const samples = blurSamples(settings)
  const spacing = BLUR_SOURCE_FPS / settings.fps
  const reach = samples[samples.length - 1]!.offset

  // Une image de marge avant le morceau, pour que le flou de sa première image regarde aussi en arrière.
  const margin = Math.min(1, Math.floor(job.sourceStart * BLUR_SOURCE_FPS + 1e-6))
  const decodeStart = job.sourceStart - margin / BLUR_SOURCE_FPS
  const decoder = ffmpegProcess(
    job.ffmpeg,
    [
      '-ss', decodeStart.toFixed(6),
      '-t', (job.duration + (margin + 2) / BLUR_SOURCE_FPS).toFixed(6),
      '-i', job.source,
      '-map', '0:v:0',
      // La même matrice de couleurs à l'aller et au retour : le morceau flouté garde exactement ses couleurs.
      '-vf', `fps=${BLUR_SOURCE_FPS},scale=${width}:${height}:flags=bicubic:in_color_matrix=bt709`,
      '-pix_fmt', 'rgb24',
      '-f', 'rawvideo',
      'pipe:1'
    ],
    'stdout'
  )
  const encoder = ffmpegProcess(
    job.ffmpeg,
    [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-s', `${width}x${height}`,
      '-r', String(settings.fps),
      '-i', 'pipe:0',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      // Fichier intermédiaire, réencodé à l'export : presque sans perte.
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '12',
      job.output
    ],
    'stdin'
  )
  const decoded = finished(decoder)
  const encoded = finished(encoder)
  const stdin = encoder.stdin!
  // Une erreur d'écriture (FFmpeg tombé) est rapportée par `encoded`.
  stdin.on('error', () => {})

  const reader = frames(decoder.stdout!, pixels * 3)
  const loaded: Uint8Array[] = []
  let first = 0
  let ended = false
  /** L'image `index` du flux décodé (la dernière lue si le clip s'arrête avant). */
  const frame = async (index: number): Promise<Uint8Array> => {
    while (!ended && first + loaded.length <= Math.max(index, first)) {
      const next = await reader.next()
      if (next.done) ended = true
      else loaded.push(next.value)
    }
    if (loaded.length === 0) throw new Error('Le clip ne contient pas d’image à cet endroit.')
    return loaded[Math.min(Math.max(index - first, 0), loaded.length - 1)]!
  }

  const input = new Float32Array(7 * pixels)
  const tensor = new ort.Tensor('float32', input, [1, 7, height, width])
  /** Image intermédiaire entre `a` et `b` à l'instant `t` (de 0 à 1), en plans R, V, B de 0 à 1. */
  const interpolate = async (a: Uint8Array, b: Uint8Array, t: number): Promise<Float32Array> => {
    for (let p = 0, i = 0; p < pixels; p++, i += 3) {
      input[p] = a[i]! / 255
      input[pixels + p] = a[i + 1]! / 255
      input[2 * pixels + p] = a[i + 2]! / 255
      input[3 * pixels + p] = b[i]! / 255
      input[4 * pixels + p] = b[i + 1]! / 255
      input[5 * pixels + p] = b[i + 2]! / 255
    }
    input.fill(t, 6 * pixels)
    const result = await rife.run({ input: tensor })
    return result.output!.data as Float32Array
  }

  // Une image intermédiaire au bord de la fenêtre peut resservir à l'image floutée suivante (obturateur à 100 %).
  let kept = new Map<number, Float32Array>()
  const sum = new Float32Array(pixels * 3)
  const count = Math.max(1, Math.round(job.duration * settings.fps))
  let reportedAt = 0

  try {
    for (let j = 0; j < count; j++) {
      const center = margin + j * spacing
      const next = new Map<number, Float32Array>()
      sum.fill(0)
      for (const { offset, weight } of samples) {
        const position = center + offset
        const index = Math.floor(position + 1e-6)
        const t = position - index
        const a = await frame(index)
        if (t < 1e-6) {
          for (let i = 0; i < sum.length; i++) sum[i]! += a[i]! * weight
          continue
        }
        const b = await frame(index + 1)
        if (identical(a, b)) {
          for (let i = 0; i < sum.length; i++) sum[i]! += a[i]! * weight
          continue
        }
        const key = Math.round(position * 1e4)
        const planes = kept.get(key) ?? (await interpolate(a, b, t))
        if (position >= center + spacing - reach - 1e-6) next.set(key, planes)
        const scale = 255 * weight
        for (let p = 0, i = 0; p < pixels; p++, i += 3) {
          sum[i]! += planes[p]! * scale
          sum[i + 1]! += planes[pixels + p]! * scale
          sum[i + 2]! += planes[2 * pixels + p]! * scale
        }
      }
      kept = next

      const out = Buffer.allocUnsafe(pixels * 3)
      for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.max(0, Math.round(sum[i]!)))
      if (!stdin.write(out)) await Promise.race([once(stdin, 'drain'), encoded])

      // Les images d'avant la fenêtre de la prochaine image floutée ne serviront plus.
      const needed = Math.floor(center + spacing - reach + 1e-6)
      while (first < needed && loaded.length > 1) {
        loaded.shift()
        first++
      }

      const now = Date.now()
      if (now - reportedAt > 200) {
        reportedAt = now
        post({ id, kind: 'progress', fraction: (j + 1) / count })
      }
    }
    stdin.end()
    // Le décodeur a pu lire un peu plus loin que le morceau : on l'arrête sans attendre qu'on le vide.
    decoder.stdout!.destroy()
    decoder.kill('SIGKILL')
    await Promise.all([decoded, encoded])
  } catch (error) {
    decoder.stdout!.destroy()
    decoder.kill('SIGKILL')
    encoder.kill('SIGKILL')
    await rm(job.output, { force: true })
    throw error
  }
}

onMessage(async ({ id, job }) => {
  try {
    await blur(id, job)
    post({ id, kind: 'done' })
  } catch (error) {
    post({ id, kind: 'error', message: error instanceof Error ? error.message : String(error) })
  }
})
