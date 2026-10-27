import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ExportQuality, Project } from '@shared/types'
import { projectDuration, segmentsIn, videoLanes } from '@shared/project'
import { NO_CROP, placement } from '@shared/geometry'
import { audioTrackFile, clipDetails, ffmpeg } from './media-tools'
import { runtime } from './runtime'
import { buildCaptionsASS } from './captions-ass'

// Construit la commande FFmpeg qui calcule le montage final : l'image (pistes vidéo superposées, la plus haute
// par-dessus, morceaux de clips et images fixes) et le son (chaque morceau placé à son instant, au volume de sa piste,
// puis tout mélangé).

const FPS = 60
const SAMPLE_RATE = 48000

/** Un chemin libre : « Nom.mp4 », sinon « Nom 2.mp4 », « Nom 3.mp4 »… (sans les caractères interdits par Windows). */
export function freeExportPath(folder: string, name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|]/g, '-') || 'Montage'
  let path = join(folder, `${base}.mp4`)
  for (let index = 2; existsSync(path); index++) path = join(folder, `${base} ${index}.mp4`)
  return path
}

const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2)
const seconds = (value: number): string => value.toFixed(6)

export interface ExportCommand {
  args: string[]
  duration: number
  /** Dossier de travail de FFmpeg, quand il y a des sous-titres. */
  cwd?: string
  /** Supprime ce dossier de travail. */
  cleanup?: () => Promise<void>
}

const run = promisify(execFile)
const HARDWARE_ENCODERS = ['h264_nvenc', 'h264_qsv', 'h264_amf']
let encoder: Promise<string[]> | null = null

/**
 * L'encodeur H.264 de la machine. Sur Mac, celui d'Apple ; sur Windows, celui de la carte graphique (NVIDIA, Intel
 * ou AMD), essayé sur quelques images au premier export puis gardé ; sinon x264, sur le processeur.
 */
function videoEncoder(): Promise<string[]> {
  if (process.platform === 'darwin') return Promise.resolve(['-c:v', 'h264_videotoolbox'])
  encoder ??= (async () => {
    for (const name of HARDWARE_ENCODERS) {
      try {
        await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=0.2', '-c:v', name, '-f', 'null', '-'])
        return ['-c:v', name]
      } catch {
        // Pas cette carte graphique : on essaie la suivante.
      }
    }
    return ['-c:v', 'libx264', '-preset', 'veryfast']
  })()
  return encoder
}

/** Taille de la vidéo finale : celle du premier vrai média (un sous-titre n'a pas de taille), ou 1080 lignes. */
export async function exportSize(project: Project, quality: ExportQuality): Promise<{ width: number; height: number }> {
  const firstSegment = [...videoLanes(project)].reverse().flatMap((lane) => segmentsIn(project, lane.id)).find((s) => !s.caption)
  const first = firstSegment ? await clipDetails(firstSegment.source) : null
  const ratio = first && first.height > 0 ? first.width / first.height : 16 / 9
  const height = quality === '1080p' || !first ? 1080 : even(first.height)
  return { width: even(height * ratio), height }
}

/** `blurred` : pour chaque morceau qui a un motion blur, son fichier flouté (voir motion-blur.ts). */
export async function buildExport(
  project: Project,
  quality: ExportQuality,
  output: string,
  blurred: Map<string, string> = new Map()
): Promise<ExportCommand> {
  const duration = projectDuration(project)
  if (duration <= 0) throw new Error('La timeline est vide.')

  const inputs: string[] = []
  const graph: string[] = []
  let inputCount = 0
  const addInput = (path: string, start: number, length: number): number => {
    // -ss avant -i : recherche rapide, et précise puisque tout est réencodé.
    inputs.push('-ss', seconds(start), '-t', seconds(length), '-i', path)
    return inputCount++
  }
  // Image fixe : pas de -ss, elle est répétée pendant `length` secondes.
  const addImageInput = (path: string, length: number): number => {
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', seconds(length), '-i', path)
    return inputCount++
  }

  // ——— Image ———
  // Les pistes vidéo sont empilées de la plus basse à la plus haute, chacune dans l'ordre du temps.
  const lanesBottomUp = [...videoLanes(project)].reverse()
  const { width, height } = await exportSize(project, quality)

  let base = 'base0'
  graph.push(`color=c=black:s=${width}x${height}:r=${FPS}:d=${seconds(duration)},format=yuv420p[${base}]`)
  let layers = 0
  // Les sous-titres et les polices sont copiés dans un dossier de travail et nommés sans chemin dans le graphe :
  // un chemin Windows (« C:\… ») casserait son découpage, qui se fait sur les `:` et les `\`.
  const captionFiles: { name: string; text: string }[] = []
  for (const lane of lanesBottomUp) {
    for (const segment of segmentsIn(project, lane.id)) {
      if (segment.caption) continue
      const blurredFile = blurred.get(segment.id)
      const index = segment.image
        ? addImageInput(segment.source, segment.duration)
        : blurredFile
          ? addInput(blurredFile, 0, segment.duration)
          : addInput(segment.source, segment.sourceStart, segment.duration)
      // Même placement que l'aperçu : on rogne le média, puis on pose seulement la partie visible.
      // Le reste de l'image reste transparent et laisse voir les couches du dessous.
      const media = await clipDetails(segment.source)
      const mediaAspect = media.width > 0 && media.height > 0 ? media.width / media.height : width / height
      const { visible } = placement(mediaAspect, width / height, segment)
      const crop = segment.crop ?? NO_CROP
      const partWidth = even(visible.width * width)
      const partHeight = even(visible.height * height)
      const x = Math.round(visible.x * width)
      const y = Math.round(visible.y * height)
      const layer = `s${layers++}`
      graph.push(
        `[${index}:v:0]fps=${FPS},` +
          `crop=iw*${(1 - crop.left - crop.right).toFixed(6)}:ih*${(1 - crop.top - crop.bottom).toFixed(6)}:` +
          `iw*${crop.left.toFixed(6)}:ih*${crop.top.toFixed(6)},` +
          `scale=${partWidth}:${partHeight},format=yuva420p,setsar=1,trim=duration=${seconds(segment.duration)},` +
          `setpts=PTS-STARTPTS+${seconds(segment.start)}/TB[${layer}]`
      )
      const end = segment.start + segment.duration
      const next = `base${layers}`
      graph.push(
        `[${base}][${layer}]overlay=x=${x}:y=${y}:eof_action=pass:enable='between(t,${seconds(segment.start)},${seconds(end)})'[${next}]`
      )
      base = next
    }
    // Les sous-titres de la piste : libass les dessine sur un calque transparent (`alpha=1`), posé à la place de
    // la piste dans l'empilement. Une piste vidéo au-dessus passe donc devant eux, comme dans l'aperçu.
    const captions = buildCaptionsASS(project, lane.id, width, height)
    if (captions !== null) {
      const name = `captions-${captionFiles.length}.ass`
      captionFiles.push({ name, text: captions })
      const layer = `c${layers++}`
      const next = `base${layers}`
      graph.push(
        `color=c=black@0:s=${width}x${height}:r=${FPS}:d=${seconds(duration)},format=rgba,` +
          `ass=filename=${name}:fontsdir=fonts:alpha=1[${layer}]`
      )
      graph.push(`[${base}][${layer}]overlay=format=auto[${next}]`)
      base = next
    }
  }
  graph.push(`[${base}]format=yuv420p[vout]`)

  // ——— Son ———
  const sounds: string[] = []
  for (const lane of project.lanes) {
    if (lane.kind !== 'audio' || lane.muted || lane.volume <= 0) continue
    for (const segment of segmentsIn(project, lane.id)) {
      const file = await audioTrackFile(segment.source, segment.stream)
      const index = addInput(file, segment.sourceStart, segment.duration)
      const delay = Math.round(segment.start * 1000)
      const label = `a${sounds.length}`
      graph.push(
        `[${index}:a:0]aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,` +
          `volume=${lane.volume.toFixed(3)},adelay=${delay}:all=1[${label}]`
      )
      sounds.push(`[${label}]`)
    }
  }
  if (sounds.length > 0) {
    // normalize=0 : amix ne baisse pas le volume de chaque piste, le mélange respecte les réglages.
    graph.push(`${sounds.join('')}amix=inputs=${sounds.length}:normalize=0:duration=longest,apad,atrim=duration=${seconds(duration)}[aout]`)
  } else {
    graph.push(`anullsrc=r=${SAMPLE_RATE}:cl=stereo,atrim=duration=${seconds(duration)}[aout]`)
  }

  // Débit vidéo proportionnel au nombre de pixels : environ 15 Mb/s en 1080p60.
  const bitrate = Math.max(8, Math.round((width * height * FPS * 0.12) / 1e6))
  let cwd: string | undefined
  if (captionFiles.length > 0) {
    cwd = await mkdtemp(join(tmpdir(), 'easy-edit-export-'))
    await cp(runtime.fontsFolder, join(cwd, 'fonts'), { recursive: true })
    await Promise.all(captionFiles.map((file) => writeFile(join(cwd!, file.name), file.text, 'utf8')))
  }
  const work = cwd
  return {
    duration,
    cwd,
    cleanup: work ? () => rm(work, { recursive: true, force: true }) : undefined,
    args: [
      ...inputs,
      '-filter_complex', graph.join(';'),
      '-map', '[vout]',
      '-map', '[aout]',
      // Le graphe sort déjà du yuv420p ; sans -pix_fmt imposé, FFmpeg convertit pour l'encodeur qui en veut un autre (Intel).
      ...(await videoEncoder()),
      '-b:v', `${bitrate}M`,
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-t', seconds(duration),
      output
    ]
  }
}
