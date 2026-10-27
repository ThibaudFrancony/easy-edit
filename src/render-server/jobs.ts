import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Project } from '@shared/types'
import { REMOTE_FILE_NAME, type RenderJob, type RenderJobRequest } from '@shared/render-protocol'
import { renderProject } from '../main/render'

// Les rendus du service : un à la fois, dans l'ordre d'arrivée. Chaque rendu est noté dans `jobs/<id>.json`
// (sa vidéo dans `jobs/<id>.mp4`) : rien ne se perd si le PC redémarre ou si l'app du Mac est fermée.

type Listener = (job: RenderJob) => void

interface Entry {
  job: RenderJob
  request: RenderJobRequest
  abort: AbortController
  listeners: Set<Listener>
}

export class Jobs {
  private entries = new Map<string, Entry>()
  private queue: string[] = []
  private running = false

  constructor(
    private folder: string,
    private filesFolder: string
  ) {}

  /** Relit les rendus gardés ; un rendu coupé par un redémarrage est relancé. */
  async load(): Promise<void> {
    await mkdir(this.folder, { recursive: true })
    for (const name of await readdir(this.folder)) {
      if (!name.endsWith('.json')) continue
      try {
        const saved = JSON.parse(await readFile(join(this.folder, name), 'utf8')) as { job: RenderJob; request: RenderJobRequest }
        const entry: Entry = { ...saved, abort: new AbortController(), listeners: new Set() }
        this.entries.set(saved.job.id, entry)
        if (saved.job.status === 'queued' || saved.job.status === 'running') {
          entry.job = { ...saved.job, status: 'queued', fraction: 0 }
          this.queue.push(saved.job.id)
        }
      } catch {
        // Un fichier abîmé ne bloque pas les autres.
      }
    }
    this.queue.sort((a, b) => this.entries.get(a)!.job.createdAt - this.entries.get(b)!.job.createdAt)
    void this.next()
  }

  /** Les fichiers que le projet demande et que le service n'a pas (l'app doit les envoyer d'abord). */
  missingFiles(project: Project): string[] {
    const names = new Set(project.segments.filter((s) => !s.caption).map((s) => s.source))
    return [...names].filter((name) => !REMOTE_FILE_NAME.test(name) || !existsSync(join(this.filesFolder, name)))
  }

  async add(request: RenderJobRequest): Promise<RenderJob> {
    const job: RenderJob = {
      id: randomUUID(),
      name: request.name,
      folder: request.folder,
      status: 'queued',
      fraction: 0,
      step: 'blur',
      createdAt: Date.now()
    }
    this.entries.set(job.id, { job, request, abort: new AbortController(), listeners: new Set() })
    this.queue.push(job.id)
    await this.save(job.id)
    void this.next()
    return job
  }

  list(): RenderJob[] {
    return [...this.entries.values()].map((e) => e.job).sort((a, b) => a.createdAt - b.createdAt)
  }

  get(id: string): RenderJob | undefined {
    return this.entries.get(id)?.job
  }

  output(id: string): string {
    return join(this.folder, `${id}.mp4`)
  }

  /** Suit un rendu : `listener` reçoit son état tout de suite, puis à chaque changement. */
  watch(id: string, listener: Listener): () => void {
    const entry = this.entries.get(id)
    if (!entry) return () => {}
    entry.listeners.add(listener)
    listener(entry.job)
    return () => entry.listeners.delete(listener)
  }

  /** Annule un rendu en attente ou en cours ; un rendu fini est oublié, avec sa vidéo. */
  async remove(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.job.status === 'running') {
      // Le rendu s'arrête ; `next` notera « annulé » puis passera au suivant.
      entry.abort.abort()
      return
    }
    if (entry.job.status === 'queued') {
      this.queue = this.queue.filter((queued) => queued !== id)
      this.update(id, { status: 'cancelled' })
    }
    this.entries.delete(id)
    await Promise.all([rm(join(this.folder, `${id}.json`), { force: true }), rm(this.output(id), { force: true })])
  }

  private async next(): Promise<void> {
    if (this.running) return
    const id = this.queue.shift()
    if (!id) return
    const entry = this.entries.get(id)
    if (!entry) return void this.next()
    this.running = true
    this.update(id, { status: 'running', fraction: 0 })
    // Les morceaux désignent des fichiers envoyés par l'app, rangés dans `files/`.
    const project: Project = {
      ...entry.request.project,
      segments: entry.request.project.segments.map((s) => (s.caption ? s : { ...s, source: join(this.filesFolder, s.source) }))
    }
    const partial = join(this.folder, `${id}.partial.mp4`)
    try {
      const missing = this.missingFiles(entry.request.project)
      if (missing.length > 0) throw new Error(`Fichiers manquants sur le PC : ${missing.join(', ')}`)
      let reportedAt = 0
      await renderProject(
        project,
        entry.request.quality,
        partial,
        (fraction, step) => {
          // Au plus 5 fois par seconde : la progression part sur le réseau.
          const now = Date.now()
          if (now - reportedAt < 200 && step === entry.job.step) return
          reportedAt = now
          this.update(id, { fraction, step }, false)
        },
        entry.abort.signal
      )
      await rename(partial, this.output(id))
      this.update(id, { status: 'done', fraction: 1 })
    } catch (error) {
      await rm(partial, { force: true })
      const failure = error as Error
      if (failure.name === 'AbortError') {
        this.update(id, { status: 'cancelled' }, false)
        this.entries.delete(id)
        await rm(join(this.folder, `${id}.json`), { force: true })
      } else {
        this.update(id, { status: 'error', error: failure.message })
      }
    } finally {
      this.running = false
      void this.next()
    }
  }

  private update(id: string, change: Partial<RenderJob>, persist = true): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.job = { ...entry.job, ...change }
    for (const listener of entry.listeners) listener(entry.job)
    if (persist) void this.save(id)
  }

  private async save(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    const path = join(this.folder, `${id}.json`)
    await writeFile(`${path}.tmp`, JSON.stringify({ job: entry.job, request: entry.request }))
    await rename(`${path}.tmp`, path)
  }
}
