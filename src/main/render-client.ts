import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ExportQuality, ExportStep, Project } from '@shared/types'
import { RENDER_CODE_HEADER, type RenderJob, type RenderJobRequest, remoteFileName } from '@shared/render-protocol'
import { freeExportPath } from './export'

// Le côté app du rendu sur le PC Linux (voir src/shared/render-protocol.ts) : envoie les fichiers qui manquent,
// demande le rendu, suit sa progression et récupère la vidéo. Sans Electron, pour pouvoir l'essayer dans Node.

export interface RenderServer {
  name: string
  address: string
  port: number
}

type Progress = (fraction: number, step: ExportStep) => void

const abortError = (): Error => Object.assign(new Error('Export annulé'), { name: 'AbortError' })

const hashes = new Map<string, Promise<string>>()

/** Empreinte SHA-256 d'un fichier, recalculée seulement s'il change. */
async function fileHash(path: string): Promise<string> {
  const info = await stat(path)
  const key = `${path}|${info.mtimeMs}|${info.size}`
  let pending = hashes.get(key)
  if (!pending) {
    pending = (async () => {
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
      return hash.digest('hex')
    })()
    pending.catch(() => hashes.delete(key))
    hashes.set(key, pending)
  }
  return pending
}

export class RenderClient {
  constructor(
    readonly server: RenderServer,
    private code: string
  ) {}

  private async call(method: string, path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`http://${this.server.address}:${this.server.port}${path}`, {
      ...init,
      method,
      headers: { ...(init.headers as Record<string, string>), [RENDER_CODE_HEADER]: this.code }
    })
    if (response.status === 401) throw Object.assign(new Error('Code du PC incorrect.'), { name: 'CodeError' })
    return response
  }

  /** Le code d'appairage est-il le bon ? */
  async check(): Promise<boolean> {
    try {
      return (await this.call('GET', '/check')).status === 204
    } catch (error) {
      if ((error as Error).name === 'CodeError') return false
      throw error
    }
  }

  async jobs(): Promise<RenderJob[]> {
    return (await (await this.call('GET', '/jobs')).json()) as RenderJob[]
  }

  async forget(id: string): Promise<void> {
    await this.call('DELETE', `/jobs/${id}`).catch(() => undefined)
  }

  /** Demande un rendu : envoie d'abord les fichiers que le PC n'a pas encore. Renvoie l'identifiant du rendu. */
  async submit(project: Project, quality: ExportQuality, name: string, folder: string, onProgress: Progress, signal: AbortSignal): Promise<string> {
    // Chaque fichier source devient son nom chez le service : empreinte et extension.
    const sources = [...new Set(project.segments.filter((s) => !s.caption).map((s) => s.source))]
    const names = new Map<string, string>()
    for (const source of sources) names.set(source, remoteFileName(await fileHash(source), extname(source)))
    if (signal.aborted) throw abortError()

    const missing: { source: string; size: number }[] = []
    for (const source of sources) {
      const response = await this.call('HEAD', `/files/${names.get(source)}`, { signal })
      if (response.status !== 200) missing.push({ source, size: (await stat(source)).size })
    }
    const total = missing.reduce((sum, file) => sum + file.size, 0)
    let sent = 0
    onProgress(0, 'upload')
    for (const { source } of missing) {
      const counted = async function* (): AsyncGenerator<Buffer> {
        for await (const chunk of createReadStream(source) as AsyncIterable<Buffer>) {
          sent += chunk.length
          onProgress(total > 0 ? sent / total : 1, 'upload')
          yield chunk
        }
      }
      const response = await this.call('PUT', `/files/${names.get(source)}`, {
        body: Readable.toWeb(Readable.from(counted())) as ReadableStream,
        duplex: 'half',
        signal
      } as RequestInit)
      if (response.status !== 204) throw new Error(`Le PC a refusé ${source} (${response.status}).`)
    }

    const request: RenderJobRequest = {
      project: { ...project, segments: project.segments.map((s) => (s.caption ? s : { ...s, source: names.get(s.source)! })) },
      quality,
      name,
      folder
    }
    const response = await this.call('POST', '/jobs', { body: JSON.stringify(request), headers: { 'content-type': 'application/json' }, signal })
    if (response.status !== 201) throw new Error(`Le PC n'a pas accepté le rendu (${response.status}).`)
    return ((await response.json()) as { id: string }).id
  }

  /** Suit un rendu jusqu'à sa fin ; annuler `signal` annule aussi le rendu sur le PC. */
  async follow(id: string, onProgress: Progress, signal: AbortSignal): Promise<RenderJob> {
    const cancel = (): void => void this.forget(id)
    signal.addEventListener('abort', cancel)
    try {
      const response = await this.call('GET', `/jobs/${id}/events`, { signal })
      if (!response.ok || !response.body) throw new Error('Le rendu a disparu du PC.')
      let buffer = ''
      let last: RenderJob | null = null
      for await (const chunk of response.body.pipeThrough(new TextDecoderStream()) as unknown as AsyncIterable<string>) {
        buffer += chunk
        const messages = buffer.split('\n\n')
        buffer = messages.pop() ?? ''
        for (const message of messages) {
          if (!message.startsWith('data: ')) continue
          last = JSON.parse(message.slice(6)) as RenderJob
          if (last.status === 'running') onProgress(last.fraction, last.step)
        }
      }
      if (signal.aborted) throw abortError()
      if (!last || last.status === 'queued' || last.status === 'running') throw new Error('Le PC ne répond plus.')
      if (last.status === 'cancelled') throw abortError()
      if (last.status === 'error') throw new Error(last.error ?? 'Le rendu a échoué sur le PC.')
      return last
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  /** Récupère la vidéo d'un rendu fini dans son dossier (« Nom 2.mp4 » si le nom est pris), puis l'oublie sur le PC. */
  async download(job: RenderJob, onProgress: Progress, signal: AbortSignal): Promise<string> {
    const response = await this.call('GET', `/jobs/${job.id}/output`, { signal })
    if (!response.ok || !response.body) throw new Error('La vidéo n’est plus sur le PC.')
    const size = Number(response.headers.get('content-length') ?? 0)
    await mkdir(job.folder, { recursive: true })
    const output = freeExportPath(job.folder, job.name)
    const partial = `${output}.partial`
    let received = 0
    onProgress(0, 'download')
    try {
      const counted = async function* (): AsyncGenerator<Uint8Array> {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          received += chunk.length
          if (size > 0) onProgress(received / size, 'download')
          yield chunk
        }
      }
      await pipeline(Readable.from(counted()), createWriteStream(partial))
      await rename(partial, output)
    } catch (error) {
      await rm(partial, { force: true })
      throw signal.aborted ? abortError() : error
    }
    await this.forget(job.id)
    return output
  }
}
