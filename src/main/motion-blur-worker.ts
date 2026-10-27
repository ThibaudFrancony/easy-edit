// Processus utilitaire du flou de mouvement (lancé par motion-blur.ts) : FFmpeg décode le clip en images RGB, RIFE
// (onnxruntime-node, sur la puce graphique quand c'est possible) calcule les images intermédiaires, on les mélange,
// et un second FFmpeg encode le résultat. Tout se fait image par image : la mémoire reste petite. La carte reçoit les
// calculs d'avance, pour ne jamais attendre le processeur.
import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import type { Readable } from 'node:stream'
import * as ort from 'onnxruntime-node'
import { BLUR_SOURCE_FPS, blurSamples } from '@shared/motion-blur'
import type { BlurIn, BlurJob, BlurModels, BlurOut } from './motion-blur-messages'

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

type Provider = ort.InferenceSession.ExecutionProviderConfig

const GPU_PROVIDERS: Record<string, Provider[]> = {
  darwin: [{ name: 'coreml', coreMlFlags: COREML_FLAGS }, 'webgpu'],
  win32: ['dml'],
  // Le service de rendu sur le PC Linux (carte NVIDIA, bibliothèques CUDA dans LD_LIBRARY_PATH).
  linux: ['cuda']
}

/**
 * RIFE prêt à calculer. `raw` : le modèle CUDA, qui prend les images telles que FFmpeg les donne (RGB, octets) et
 * rend l'image intermédiaire de la même façon ; sinon le modèle d'origine, en plans R, V, B de 0 à 1.
 */
interface Rife {
  session: ort.InferenceSession
  raw: boolean
}

let current: { key: string; rife: Promise<Rife> } | null = null

/** Le modèle à essayer avec ce moteur : la version CUDA (demi-précision) n'est faite que pour la carte NVIDIA. */
const modelFor = (provider: Provider | 'cpu', models: BlurModels): string => (provider === 'cuda' ? models.cuda : models.standard)

function createRife(model: string, provider: Provider | 'cpu', width: number, height: number): Promise<ort.InferenceSession> {
  // DirectML ne sait pas exécuter le graphe en parallèle ni réutiliser un plan mémoire.
  const dml = provider === 'dml' ? { enableMemPattern: false, executionMode: 'sequential' as const } : {}
  return ort.InferenceSession.create(model, {
    graphOptimizationLevel: 'all',
    freeDimensionOverrides: { batch: 1, height, width },
    ...dml,
    executionProviders: [provider]
  })
}

/**
 * RIFE pour cette taille d'image, gardé tant que la taille ne change pas. Chaque moteur graphique disponible est
 * essayé sur une image ; on garde le plus rapide, le processeur seulement si aucun ne marche.
 */
function rifeFor(models: BlurModels, width: number, height: number): Promise<Rife> {
  const key = `${models.standard}|${models.cuda}|${width}x${height}`
  if (current?.key === key) return current.rife
  const previous = current
  const created = (async (): Promise<Rife> => {
    await (await previous?.rife.catch(() => null))?.session.release()
    let best: { rife: Rife; ms: number } | null = null
    for (const provider of GPU_PROVIDERS[process.platform] ?? []) {
      try {
        const session = await createRife(modelFor(provider, models), provider, width, height)
        const candidate = { session, raw: session.inputNames.includes('img0') }
        const ms = await benchmark(candidate, width, height)
        if (best && best.ms <= ms) await session.release()
        else {
          await best?.rife.session.release()
          best = { rife: candidate, ms }
        }
      } catch {
        // Ce moteur n'est pas disponible sur cette machine : on essaie le suivant.
      }
    }
    if (best) return best.rife
    return { session: await createRife(models.standard, 'cpu', width, height), raw: false }
  })()
  current = { key, rife: created }
  created.catch(() => (current = null))
  return created
}

/** Les entrées d'un calcul : deux images RGB et l'instant `t` (de 0 à 1). `planes` sert au modèle d'origine. */
function feeds(rife: Rife, a: Uint8Array, b: Uint8Array, t: number, width: number, height: number, planes: Float32Array): ort.InferenceSession.FeedsType {
  if (rife.raw) {
    return {
      img0: new ort.Tensor('uint8', a, [height, width, 3]),
      img1: new ort.Tensor('uint8', b, [height, width, 3]),
      timestep: new ort.Tensor('float32', Float32Array.of(t), [1])
    }
  }
  const pixels = width * height
  for (let p = 0, i = 0; p < pixels; p++, i += 3) {
    planes[p] = a[i]! / 255
    planes[pixels + p] = a[i + 1]! / 255
    planes[2 * pixels + p] = a[i + 2]! / 255
    planes[3 * pixels + p] = b[i]! / 255
    planes[4 * pixels + p] = b[i + 1]! / 255
    planes[5 * pixels + p] = b[i + 2]! / 255
  }
  planes.fill(t, 6 * pixels)
  return { input: new ort.Tensor('float32', planes, [1, 7, height, width]) }
}

/** Durée d'une image intermédiaire, mesurée au deuxième passage (le premier prépare le moteur). */
async function benchmark(rife: Rife, width: number, height: number): Promise<number> {
  const image = new Uint8Array(width * height * 3).fill(128)
  const input = feeds(rife, image, image, 0.5, width, height, new Float32Array(rife.raw ? 0 : 7 * width * height))
  await rife.session.run(input)
  const start = performance.now()
  await rife.session.run(input)
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

/** Calculs RIFE confiés à la carte en même temps : elle enchaîne pendant que le processeur prépare et mélange. */
const IN_FLIGHT = 2

/** Une image intermédiaire : octets RGB (modèle CUDA) ou plans R, V, B de 0 à 1 (modèle d'origine). */
type Interpolated = Uint8Array | Float32Array

/** Ce qui compose une image floutée : une vraie image, ou une image intermédiaire en cours de calcul. */
interface Part {
  weight: number
  frame?: Uint8Array
  interpolated?: Promise<Interpolated>
}

async function blur(id: number, job: BlurJob): Promise<void> {
  const { width, height, settings } = job
  const pixels = width * height
  const rife = await rifeFor(job.models, width, height)
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

  // Les places de calcul sur la carte, chacune avec son tampon d'entrée (modèle d'origine), prises dans l'ordre.
  const free: Float32Array[] = Array.from({ length: IN_FLIGHT }, () => new Float32Array(rife.raw ? 0 : 7 * pixels))
  const waiting: ((planes: Float32Array) => void)[] = []
  const take = (): Promise<Float32Array> => (free.length > 0 ? Promise.resolve(free.pop()!) : new Promise((resolve) => waiting.push(resolve)))
  const give = (planes: Float32Array): void => {
    const next = waiting.shift()
    if (next) next(planes)
    else free.push(planes)
  }
  const interpolate = async (a: Uint8Array, b: Uint8Array, t: number): Promise<Interpolated> => {
    const planes = await take()
    try {
      const result = await rife.session.run(feeds(rife, a, b, t, width, height, planes))
      return result[rife.session.outputNames[0]!]!.data as Interpolated
    } finally {
      give(planes)
    }
  }

  // Une image intermédiaire au bord de la fenêtre peut resservir à l'image floutée suivante (obturateur à 100 %).
  let kept = new Map<number, Promise<Interpolated>>()
  /** Les images qui composent l'image floutée `j` ; ses calculs RIFE partent tout de suite sur la carte. */
  const plan = async (j: number): Promise<Part[]> => {
    const center = margin + j * spacing
    const next = new Map<number, Promise<Interpolated>>()
    const parts: Part[] = []
    for (const { offset, weight } of samples) {
      const position = center + offset
      const index = Math.floor(position + 1e-6)
      const t = position - index
      const a = await frame(index)
      if (t < 1e-6) {
        parts.push({ weight, frame: a })
        continue
      }
      const b = await frame(index + 1)
      if (identical(a, b)) {
        parts.push({ weight, frame: a })
        continue
      }
      const key = Math.round(position * 1e4)
      let interpolated = kept.get(key)
      if (!interpolated) {
        interpolated = interpolate(a, b, t)
        // L'erreur est rapportée quand on attend ce calcul, pas avant.
        interpolated.catch(() => {})
      }
      if (position >= center + spacing - reach - 1e-6) next.set(key, interpolated)
      parts.push({ weight, interpolated })
    }
    kept = next
    return parts
  }

  const sum = new Float32Array(pixels * 3)
  const count = Math.max(1, Math.round(job.duration * settings.fps))
  let reportedAt = 0

  try {
    let parts = await plan(0)
    for (let j = 0; j < count; j++) {
      // L'image suivante part sur la carte avant qu'on mélange celle-ci : la carte ne s'arrête pas.
      const upcoming = j + 1 < count ? await plan(j + 1) : []
      sum.fill(0)
      for (const { weight, frame, interpolated } of parts) {
        if (frame) {
          for (let i = 0; i < sum.length; i++) sum[i]! += frame[i]! * weight
          continue
        }
        const image = await interpolated!
        if (image instanceof Uint8Array) {
          for (let i = 0; i < sum.length; i++) sum[i]! += image[i]! * weight
          continue
        }
        const scale = 255 * weight
        for (let p = 0, i = 0; p < pixels; p++, i += 3) {
          sum[i]! += image[p]! * scale
          sum[i + 1]! += image[pixels + p]! * scale
          sum[i + 2]! += image[2 * pixels + p]! * scale
        }
      }
      parts = upcoming

      const out = Buffer.allocUnsafe(pixels * 3)
      // Arrondi et bornes de 0 à 255 faits par le moteur JavaScript lui-même, bien plus vite qu'une boucle.
      new Uint8ClampedArray(out.buffer, out.byteOffset, out.length).set(sum)
      if (!stdin.write(out)) await Promise.race([once(stdin, 'drain'), encoded])

      // Les images d'avant la fenêtre de l'image floutée d'après la suivante ne serviront plus.
      const needed = Math.floor(margin + (j + 2) * spacing - reach + 1e-6)
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
