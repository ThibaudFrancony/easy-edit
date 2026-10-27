import type { ExportQuality, ExportStep, Project } from '@shared/types'
import { buildExport, exportSize } from './export'
import { runFFmpeg } from './ffmpeg-run'
import { ffmpeg } from './media-tools'
import { prepareMotionBlur } from './motion-blur'

const abortError = (): Error => Object.assign(new Error('Export annulé'), { name: 'AbortError' })

/**
 * Calcule un montage dans `output` : le motion blur des pistes qui en ont, puis la vidéo finale. Le même code sert
 * à l'app et au service de rendu du PC Linux. `signal` l'annule (erreur `AbortError`, fichier partiel supprimé).
 */
export async function renderProject(
  project: Project,
  quality: ExportQuality,
  output: string,
  onProgress: (fraction: number, step: ExportStep) => void,
  signal: AbortSignal
): Promise<void> {
  const { height } = await exportSize(project, quality)
  const blurred = await prepareMotionBlur(project, height, (fraction) => onProgress(fraction, 'blur'), signal)
  if (signal.aborted) throw abortError()
  const command = await buildExport(project, quality, output, blurred)
  try {
    if (signal.aborted) throw abortError()
    const encoding = runFFmpeg(ffmpeg, command.args, output, command.duration, (fraction) => onProgress(fraction, 'encode'), command.cwd)
    const cancel = (): void => encoding.cancel()
    signal.addEventListener('abort', cancel)
    try {
      await encoding.done
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  } finally {
    // Le dossier de travail des sous-titres, s'il y en a un.
    await command.cleanup?.()
  }
}
