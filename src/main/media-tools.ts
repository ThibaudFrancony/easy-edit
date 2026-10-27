import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { AudioTrackInfo, ClipDetails } from '@shared/types'
import { DEFAULT_IMAGE_DURATION } from '@shared/project'
import { readMp4Tracks } from './mp4'
import { runtime } from './runtime'

// Ce que l'export a besoin de savoir des fichiers, partagé par l'app et le service de rendu (sans Electron) :
// FFmpeg, l'analyse d'un clip, le cache, l'extraction des pistes audio.

export const run = promisify(execFile)

// Dans l'app empaquetée, les binaires sont sortis de l'archive asar (voir `asarUnpack`).
const unpacked = (path: string): string => path.replace('app.asar', 'app.asar.unpacked')
export const ffmpeg = unpacked(ffmpegStatic as unknown as string)
const ffprobe = unpacked(ffprobeStatic.path)

/** Vidéos que l'aperçu sait lire telles quelles. */
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm']
/** Vidéos acceptées à l'import ; un .mkv (OBS) est d'abord converti en .mp4, sans réencodage. */
export const IMPORTABLE_VIDEO_EXTENSIONS = [...VIDEO_EXTENSIONS, 'mkv']
/** Formats acceptés pour les fonds sonores. */
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'aif', 'aiff', 'flac', 'ogg']

/** Ordre des pistes de ReplayClip, utilisé quand un fichier a perdu leurs noms (versions compressées). */
const REPLAYCLIP_TRACK_NAMES = ['Mix', 'Micro', 'Minecraft', 'Discord', 'Autres sons']

/** Formats d'image acceptés (ceux que FFmpeg sait lire à l'export). */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff']

export const extensionOf = (path: string): string => extname(path).slice(1).toLowerCase()
export const isAudioPath = (path: string): boolean => AUDIO_EXTENSIONS.includes(extensionOf(path))
export const isImagePath = (path: string): boolean => IMAGE_EXTENSIONS.includes(extensionOf(path))
export const isVideoPath = (path: string): boolean => VIDEO_EXTENSIONS.includes(extensionOf(path))

interface ProbeStream {
  index: number
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  channels?: number
  disposition?: { attached_pic?: number }
}

const detailsCache = new Map<string, Promise<ClipDetails>>()

export function clipDetails(path: string): Promise<ClipDetails> {
  let pending = detailsCache.get(path)
  if (!pending) {
    pending = probe(path)
    pending.catch(() => detailsCache.delete(path))
    detailsCache.set(path, pending)
  }
  return pending
}

async function probe(path: string): Promise<ClipDetails> {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
  const data = JSON.parse(stdout) as { format: { duration?: string }; streams: ProbeStream[] }

  // Une image : un seul flux vidéo, sans son, de durée libre (5 s proposées).
  if (isImagePath(path)) {
    const picture = data.streams.find((s) => s.codec_type === 'video')
    return {
      path, image: true, duration: DEFAULT_IMAGE_DURATION,
      width: picture?.width ?? 0, height: picture?.height ?? 0, videoStream: picture?.index ?? 0, audioTracks: []
    }
  }
  // Une pochette d'album (mp3, m4a) est un flux vidéo « attached_pic » : ce n'est pas une vidéo.
  const video = data.streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const audio = data.streams.filter((s) => s.codec_type === 'audio')

  // Un fichier audio (fond sonore) : une seule piste, au nom du fichier.
  if (!video) {
    return {
      path,
      duration: Number(data.format.duration ?? 0),
      width: 0,
      height: 0,
      videoStream: null,
      audioTracks: audio.slice(0, 1).map((s) => ({
        stream: s.index, name: basename(path, extname(path)), channels: s.channels ?? 2, codec: s.codec_name ?? ''
      }))
    }
  }

  // FFmpeg ne lit pas les noms de pistes écrits par ReplayClip : on les prend dans l'en-tête MP4.
  const mp4Audio = (await readMp4Tracks(path)).filter((t) => t.kind === 'audio')
  const tracks = audio.map((stream, i): AudioTrackInfo => {
    const mp4 = mp4Audio[i]
    return {
      stream: stream.index,
      // L'ordre de ReplayClip ne vaut que pour ses fichiers (même nombre de pistes) ; ailleurs, « Piste 1 », « Piste 2 »…
      name: mp4?.name ?? (audio.length === REPLAYCLIP_TRACK_NAMES.length ? REPLAYCLIP_TRACK_NAMES[i] : undefined) ?? `Piste ${i + 1}`,
      channels: stream.channels ?? 2,
      codec: stream.codec_name ?? ''
    }
  })
  // ReplayClip : la première piste est le « Mix » des suivantes, qu'on règle séparément ; on le laisse de côté.
  // Les autres fichiers (OBS, téléphone…) gardent toutes leurs pistes.
  const sources = tracks.length > 1 && tracks[0]?.name === 'Mix' ? tracks.slice(1) : tracks

  return {
    path,
    duration: Number(data.format.duration ?? 0),
    width: video.width ?? 0,
    height: video.height ?? 0,
    videoStream: video.index,
    audioTracks: sources
  }
}

/** Clé de cache : change si le fichier est modifié, pour ne jamais servir un vieux résultat. */
export async function cacheKey(path: string, extra = ''): Promise<string> {
  const info = await stat(path)
  return createHash('sha256').update(`${path}|${info.mtimeMs}|${info.size}|${extra}`).digest('hex').slice(0, 24)
}

const inFlight = new Map<string, Promise<string>>()

/** Produit un fichier de cache une seule fois, même si plusieurs demandes arrivent en même temps. */
export async function cached(folder: string, name: string, produce: (output: string) => Promise<void>): Promise<string> {
  const output = join(runtime.cacheFolder, folder, name)
  if (existsSync(output)) return output
  let pending = inFlight.get(output)
  if (!pending) {
    pending = (async () => {
      await mkdir(join(runtime.cacheFolder, folder), { recursive: true })
      // Écrit à côté puis renomme : un fichier interrompu n'est jamais pris pour un résultat.
      const partial = output.replace(/(\.\w+)$/, '.partial$1')
      await produce(partial)
      await rename(partial, output)
      return output
    })().finally(() => inFlight.delete(output))
    inFlight.set(output, pending)
  }
  return pending
}

/** Le fichier `.m4a` (en cache) d'une piste audio d'un clip ou d'un fond sonore. */
export async function audioTrackFile(path: string, stream: number): Promise<string> {
  const codec = (await clipDetails(path)).audioTracks.find((t) => t.stream === stream)?.codec
  const encoding = codec === 'aac' ? ['-c', 'copy'] : ['-c:a', 'aac', '-b:a', '256k']
  return cached('audio', `${await cacheKey(path, String(stream))}.m4a`, async (output) => {
    await run(ffmpeg, ['-v', 'error', '-y', '-i', path, '-map', `0:${stream}`, '-vn', ...encoding, output])
  })
}
