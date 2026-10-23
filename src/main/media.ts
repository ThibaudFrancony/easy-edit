import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { AudioTrackInfo, ClipDetails, ClipFile } from '@shared/types'
import { toMediaURL } from '@shared/media-url'
import { readMp4Tracks } from './mp4'

const run = promisify(execFile)

// Dans l'app empaquetée, les binaires sont sortis de l'archive asar (voir `asarUnpack`).
const unpacked = (path: string): string => path.replace('app.asar', 'app.asar.unpacked')
const ffmpeg = unpacked(ffmpegStatic as unknown as string)
const ffprobe = unpacked(ffprobeStatic.path)

export const clipsFolder = join(homedir(), 'Movies', 'Clips')
// Pas « Cache » : ce dossier appartient au cache HTTP de Chromium.
const cacheFolder = join(app.getPath('userData'), 'Media')
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v'])
/** Formats acceptés pour les fonds sonores. */
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'aif', 'aiff', 'flac', 'ogg']

/** Ordre des pistes de ReplayClip, utilisé quand un fichier a perdu leurs noms (versions compressées). */
const REPLAYCLIP_TRACK_NAMES = ['Mix', 'Micro', 'Minecraft', 'Discord', 'Autres sons']

export async function listClips(): Promise<ClipFile[]> {
  let names: string[]
  try {
    names = await readdir(clipsFolder)
  } catch {
    return []
  }
  const files = await Promise.all(
    names
      .filter((name) => !name.startsWith('.') && VIDEO_EXTENSIONS.has(extname(name).toLowerCase()))
      .map(async (name): Promise<ClipFile | null> => {
        const path = join(clipsFolder, name)
        try {
          const info = await stat(path)
          return { path, createdAt: info.birthtimeMs, modifiedAt: info.mtimeMs, size: info.size }
        } catch {
          return null
        }
      })
  )
  return files.filter((file): file is ClipFile => file !== null).sort((a, b) => b.createdAt - a.createdAt)
}

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
  const tracks = audio.map((stream, i) => {
    const mp4 = mp4Audio[i]
    const info: AudioTrackInfo = {
      stream: stream.index,
      name: mp4?.name ?? REPLAYCLIP_TRACK_NAMES[i] ?? `Piste ${i + 1}`,
      channels: stream.channels ?? 2,
      codec: stream.codec_name ?? ''
    }
    return { info, enabled: mp4?.enabled ?? true }
  })
  // ReplayClip : seule la piste « Mix » est activée, les sources séparées sont désactivées.
  const separate = tracks.length > 1 ? tracks.filter((t) => !t.enabled) : []
  const sansMix = tracks.length === REPLAYCLIP_TRACK_NAMES.length ? tracks.slice(1) : tracks

  return {
    path,
    duration: Number(data.format.duration ?? 0),
    width: video.width ?? 0,
    height: video.height ?? 0,
    videoStream: video.index,
    audioTracks: (separate.length > 0 ? separate : sansMix).map((t) => t.info)
  }
}

/** Clé de cache : change si le fichier est modifié, pour ne jamais servir un vieux résultat. */
async function cacheKey(path: string, extra = ''): Promise<string> {
  const info = await stat(path)
  return createHash('sha256').update(`${path}|${info.mtimeMs}|${info.size}|${extra}`).digest('hex').slice(0, 24)
}

const inFlight = new Map<string, Promise<string>>()

/** Produit un fichier de cache une seule fois, même si plusieurs demandes arrivent en même temps. */
async function cached(folder: string, name: string, produce: (output: string) => Promise<void>): Promise<string> {
  const output = join(cacheFolder, folder, name)
  if (existsSync(output)) return output
  let pending = inFlight.get(output)
  if (!pending) {
    pending = (async () => {
      await mkdir(join(cacheFolder, folder), { recursive: true })
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

export async function thumbnail(path: string): Promise<string> {
  const file = await cached('thumbnails', `${await cacheKey(path)}.jpg`, async (output) => {
    await run(ffmpeg, ['-v', 'error', '-y', '-ss', '2', '-i', path, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', output])
  })
  return toMediaURL(file)
}

/** Extrait une piste audio : sans la réencoder si c'est de l'AAC (presque instantané), sinon en la convertissant. */
export async function audioTrack(path: string, stream: number): Promise<string> {
  const codec = (await clipDetails(path)).audioTracks.find((t) => t.stream === stream)?.codec
  const encoding = codec === 'aac' ? ['-c', 'copy'] : ['-c:a', 'aac', '-b:a', '256k']
  const file = await cached('audio', `${await cacheKey(path, String(stream))}.m4a`, async (output) => {
    await run(ffmpeg, ['-v', 'error', '-y', '-i', path, '-map', `0:${stream}`, '-vn', ...encoding, output])
  })
  return toMediaURL(file)
}
