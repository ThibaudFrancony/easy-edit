import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ExportQuality, Project } from '@shared/types'
import { projectDuration, segmentsIn } from '@shared/project'
import { audioTrackFile, clipDetails } from './media'

// Construit la commande FFmpeg qui calcule le montage final : l'image (morceaux et trous noirs mis bout à bout)
// et le son (chaque morceau placé à son instant, au volume de sa piste, puis tout mélangé).

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
}

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

  // ——— Image ———
  const videoLane = project.lanes.find((l) => l.kind === 'video')
  const videoSegments = videoLane ? segmentsIn(project, videoLane.id) : []
  const first = videoSegments[0] ? await clipDetails(videoSegments[0].source) : null
  const ratio = first && first.height > 0 ? first.width / first.height : 16 / 9
  const height = quality === '1080p' || !first ? 1080 : even(first.height)
  const width = even(height * ratio)
  const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`

  const pieces: string[] = []
  const black = (length: number): void => {
    const label = `gap${pieces.length}`
    graph.push(`color=c=black:s=${width}x${height}:r=${FPS}:d=${seconds(length)},setsar=1,format=yuv420p[${label}]`)
    pieces.push(`[${label}]`)
  }
  let cursor = 0
  for (const segment of videoSegments) {
    if (segment.start - cursor > 1 / FPS) black(segment.start - cursor)
    const index = addInput(segment.source, segment.sourceStart, segment.duration)
    const label = `v${pieces.length}`
    graph.push(`[${index}:v:0]fps=${FPS},${fit},trim=duration=${seconds(segment.duration)},setpts=PTS-STARTPTS[${label}]`)
    pieces.push(`[${label}]`)
    cursor = Math.max(cursor, segment.start + segment.duration)
  }
  if (duration - cursor > 1 / FPS) black(duration - cursor)
  graph.push(`${pieces.join('')}concat=n=${pieces.length}:v=1:a=0[vout]`)

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
  return {
    duration,
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
