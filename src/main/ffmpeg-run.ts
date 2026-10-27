import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'

export interface RunningFFmpeg {
  /** Arrête FFmpeg ; `done` est alors rejetée avec une erreur dont `name` vaut 'AbortError'. */
  cancel(): void
  /** Résolue quand le fichier est complet ; rejetée en cas d'erreur ou d'annulation (le fichier partiel est supprimé). */
  done: Promise<void>
}

const STDERR_LIMIT = 4000
const PROGRESS_MIN_INTERVAL_MS = 100
const OUT_TIME_RE = /^out_time_(?:us|ms)=(-?\d+)$/

const abortError = (): Error => Object.assign(new Error('Export annulé'), { name: 'AbortError' })

/** Dernières lignes non vides de stderr, pour un message d'erreur lisible. */
const lastStderrLines = (stderr: string): string =>
  stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join('\n')

/**
 * Lance FFmpeg avec `args` (qui se terminent par le fichier de sortie `outputPath`).
 * `onProgress` reçoit une fraction de 0 à 1, au plus ~10 fois par seconde, d'après la durée totale `totalSeconds`.
 */
export function runFFmpeg(
  ffmpegPath: string,
  args: string[],
  outputPath: string,
  totalSeconds: number,
  onProgress: (fraction: number) => void,
  /** Dossier de travail de FFmpeg (les fichiers que le graphe de filtres nomme sans chemin). */
  cwd?: string,
): RunningFFmpeg {
  const child = spawn(
    ffmpegPath,
    ['-hide_banner', '-v', 'error', '-y', '-nostats', '-progress', 'pipe:1', ...args],
    { stdio: ['ignore', 'pipe', 'pipe'], cwd },
  )

  let cancelled = false
  let finished = false
  let stderr = ''
  let stdoutTail = ''
  let lastReported = -1
  let lastReportAt = 0

  const report = (fraction: number, force = false): void => {
    const now = Date.now()
    if (!force && now - lastReportAt < PROGRESS_MIN_INTERVAL_MS) return
    lastReportAt = now
    lastReported = fraction
    onProgress(fraction)
  }

  const handleLine = (raw: string): void => {
    if (cancelled) return
    const line = raw.trim()
    if (line === 'progress=end') {
      report(1, true)
      return
    }
    const match = OUT_TIME_RE.exec(line)
    // 'N/A' ne matche pas ; une durée nulle rendrait la fraction indéfinie
    if (!match || !(totalSeconds > 0)) return
    const seconds = Number(match[1]) / 1e6
    report(Math.min(1, Math.max(0, seconds / totalSeconds)))
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    // Une ligne peut être coupée entre deux chunks : on garde le reste pour le suivant
    const lines = (stdoutTail + chunk).split('\n')
    stdoutTail = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  })
  child.stdout.on('end', () => handleLine(stdoutTail))

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_LIMIT)
  })

  let settle!: (error: Error | null) => void
  const done = new Promise<void>((resolve, reject) => {
    settle = (error) => {
      if (finished) return
      finished = true
      if (error === null) {
        resolve()
        return
      }
      // Le fichier est supprimé avant le rejet : l'appelant ne doit jamais voir un fichier partiel
      fs.rm(outputPath, { force: true })
        .catch(() => undefined)
        .then(() => reject(error))
    }
  })

  child.on('error', (error) => settle(cancelled ? abortError() : error))

  child.on('close', (code) => {
    // 'close' (et non 'exit') : FFmpeg a fini d'écrire et stderr est entièrement lu
    if (cancelled) {
      settle(abortError())
      return
    }
    if (code === 0) {
      if (lastReported !== 1) report(1, true)
      settle(null)
      return
    }
    settle(new Error(lastStderrLines(stderr) || `FFmpeg s'est arrêté (code ${code})`))
  })

  return {
    cancel(): void {
      if (finished || cancelled) return
      cancelled = true
      child.kill('SIGKILL')
    },
    done,
  }
}
