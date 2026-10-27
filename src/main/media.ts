import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { LibraryFile } from '@shared/types'
import { toMediaURL } from '@shared/media-url'
import { clipsFolder, imagesFolder, importedVideosFolder, soundsFolder } from './folders'
import {
  IMPORTABLE_VIDEO_EXTENSIONS, audioTrackFile, cacheKey, cached, extensionOf, ffmpeg, isAudioPath, isImagePath, isVideoPath, run
} from './media-tools'

export {
  AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, IMPORTABLE_VIDEO_EXTENSIONS, audioTrackFile, cacheKey, cached, clipDetails, ffmpeg
} from './media-tools'

/** Les vidéos (clips de ReplayClip et vidéos importées), puis les images, puis les sons, chacun du plus récent au plus ancien. */
export async function listFiles(): Promise<LibraryFile[]> {
  const [clips, videos, images, sounds] = await Promise.all([
    filesIn(clipsFolder, 'video', isVideoPath),
    filesIn(importedVideosFolder, 'video', isVideoPath),
    filesIn(imagesFolder, 'image', isImagePath),
    filesIn(soundsFolder, 'audio', isAudioPath)
  ])
  return [...[...clips, ...videos].sort((a, b) => b.createdAt - a.createdAt), ...images, ...sounds]
}

async function filesIn(folder: string, kind: LibraryFile['kind'], accept: (name: string) => boolean): Promise<LibraryFile[]> {
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return []
  }
  const files = await Promise.all(
    names
      .filter((name) => !name.startsWith('.') && accept(name))
      .map(async (name): Promise<LibraryFile | null> => {
        const path = join(folder, name)
        try {
          const info = await stat(path)
          return { path, kind, createdAt: info.birthtimeMs, modifiedAt: info.mtimeMs, size: info.size }
        } catch {
          return null
        }
      })
  )
  return files.filter((file): file is LibraryFile => file !== null).sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Copie des vidéos, des sons et des images dans la bibliothèque (« Titre 2.mp3 » si le nom est pris).
 * Renvoie les chemins des copies ; les autres fichiers sont ignorés.
 */
export async function importFiles(paths: string[]): Promise<string[]> {
  const imported: string[] = []
  for (const source of paths) {
    const extension = extensionOf(source)
    const folder = IMPORTABLE_VIDEO_EXTENSIONS.includes(extension)
      ? importedVideosFolder
      : isAudioPath(source) ? soundsFolder : isImagePath(source) ? imagesFolder : null
    if (!folder) continue
    // Un fichier déjà dans la bibliothèque n'est pas copié une deuxième fois.
    if (dirname(source) === folder || dirname(source) === clipsFolder) {
      imported.push(source)
      continue
    }
    await mkdir(folder, { recursive: true })
    const remux = extension === 'mkv'
    const targetExtension = remux ? '.mp4' : extname(source)
    const base = basename(source, extname(source))
    let target = join(folder, base + targetExtension)
    for (let index = 2; existsSync(target); index++) target = join(folder, `${base} ${index}${targetExtension}`)
    // Écrit sous un nom caché puis renomme : la bibliothèque ne montre jamais une copie à moitié faite.
    const partial = join(folder, `.${basename(target)}`)
    try {
      if (remux) await remuxToMp4(source, partial)
      // Sur un disque APFS, la copie est un clone : instantanée et sans place en plus.
      else await copyFile(source, partial, constants.COPYFILE_FICLONE)
      await rename(partial, target)
      imported.push(target)
    } catch {
      // Un fichier illisible n'empêche pas d'importer les autres.
      await rm(partial, { force: true })
    }
  }
  return imported
}

/** Change seulement l'enveloppe (mkv → mp4) : l'image et le son ne sont pas réencodés, c'est presque instantané. */
async function remuxToMp4(source: string, target: string): Promise<void> {
  await run(ffmpeg, ['-v', 'error', '-y', '-i', source, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', target])
}

export async function thumbnail(path: string): Promise<string> {
  const file = await cached('thumbnails', `${await cacheKey(path)}.jpg`, async (output) => {
    // Une image n'a pas de « 2 secondes » : on prend son unique image.
    const seek = isImagePath(path) ? [] : ['-ss', '2']
    await run(ffmpeg, ['-v', 'error', '-y', ...seek, '-i', path, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', output])
  })
  return toMediaURL(file)
}

/** Extrait une piste audio : sans la réencoder si c'est de l'AAC (presque instantané), sinon en la convertissant. */
export async function audioTrack(path: string, stream: number): Promise<string> {
  return toMediaURL(await audioTrackFile(path, stream))
}

