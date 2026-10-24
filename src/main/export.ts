import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { writeFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type { ExportQuality, Project } from '@shared/types'
import { projectDuration, segmentsIn, videoLanes } from '@shared/project'
import { NO_CROP, placement } from '@shared/geometry'
import { audioTrackFile, clipDetails } from './media'
import { buildCaptionsASS } from './captions-ass'

// Construit la commande FFmpeg qui calcule le montage final : l'image (pistes vidéo superposées, la plus haute
// par-dessus, morceaux de clips et images fixes) et le son (chaque morceau placé à son instant, au volume de sa piste,
// puis tout mélangé).

export const exportsFolder = join(homedir(), 'Movies', 'Easy Edit', 'Exports')

const FPS = 60
const SAMPLE_RATE = 48000

/** Un chemin libre : « Nom.mp4 », sinon « Nom 2.mp4 », « Nom 3.mp4 »… */
export function freeExportPath(folder: string, name: string): string {
  const base = name.trim().replace(/[/:]/g, '-') || 'Montage'
  let path = join(folder, `${base}.mp4`)
  for (let index = 2; existsSync(path); index++) path = join(folder, `${base} ${index}.mp4`)
  return path
}

const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2)
const seconds = (value: number): string => value.toFixed(6)

export interface ExportCommand {
  args: string[]
  duration: number
  /** Supprime le fichier de sous-titres temporaire, s'il y en a un. */
  cleanup?: () => Promise<void>
}

// Dossier des polices embarquées : à côté de l'app une fois packagée, dans le projet en développement.
const fontsFolder = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'fonts') : join(app.getAppPath(), 'resources', 'fonts')

/** Échappe une valeur d'option de filtre FFmpeg (les `:` et `,` séparent les options). */
const filterValue = (value: string): string => value.replace(/[\\:'[\],;]/g, (char) => `\\${char}`)

export async function buildExport(project: Project, quality: ExportQuality, output: string): Promise<ExportCommand> {
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
  const firstSegment = lanesBottomUp.flatMap((lane) => segmentsIn(project, lane.id))[0]
  const first = firstSegment ? await clipDetails(firstSegment.source) : null
  const ratio = first && first.height > 0 ? first.width / first.height : 16 / 9
  const height = quality === '1080p' || !first ? 1080 : even(first.height)
  const width = even(height * ratio)

  let base = 'base0'
  graph.push(`color=c=black:s=${width}x${height}:r=${FPS}:d=${seconds(duration)},format=yuv420p[${base}]`)
  let layers = 0
  for (const lane of lanesBottomUp) {
    for (const segment of segmentsIn(project, lane.id)) {
      const index = segment.image
        ? addImageInput(segment.source, segment.duration)
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
  }
  // Sous-titres : libass les dessine par-dessus l'image finale.
  const captions = buildCaptionsASS(project, width, height)
  const captionsPath = captions === null ? null : join(tmpdir(), `easy-edit-captions-${randomUUID()}.ass`)
  if (captionsPath) {
    graph.push(`[${base}]format=yuv420p,ass=filename=${filterValue(captionsPath)}:fontsdir=${filterValue(fontsFolder())}[vout]`)
  } else {
    graph.push(`[${base}]format=yuv420p[vout]`)
  }

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
  if (captions !== null && captionsPath) await writeFile(captionsPath, captions, 'utf8')
  return {
    duration,
    cleanup: captionsPath ? () => rm(captionsPath, { force: true }) : undefined,
    args: [
      ...inputs,
      '-filter_complex', graph.join(';'),
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'h264_videotoolbox',
      '-b:v', `${bitrate}M`,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-t', seconds(duration),
      output
    ]
  }
}
