import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { Bonjour } from 'bonjour-service'
import type { ExportEvent, ExportRequest, ExportStep } from '@shared/types'
import { RENDER_PROTOCOL, RENDER_SERVICE_TYPE, type RenderJob, type RenderStatus } from '@shared/render-protocol'
import { exportsFolder } from './folders'
import { RenderClient, type RenderServer } from './render-client'

// Le PC de rendu vu depuis l'app : on le trouve sur le réseau (Bonjour), on retient son adresse et son code
// d'appairage, et on récupère les vidéos qu'il a finies pendant que l'app était fermée.

interface Settings {
  code?: string
  server?: RenderServer
}

const settingsPath = (): string => join(app.getPath('userData'), 'render.json')
let settings: Settings = {}
let server: RenderServer | null = null
let notify: (name: string | null) => void = () => {}
let sendExport: (event: ExportEvent) => void = () => {}
/** Les rendus que l'app suit déjà : la reprise au lancement ne les prend pas une deuxième fois. */
const followed = new Set<string>()

async function saveSettings(): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2))
}

/** Le service répond-il, avec la même version du protocole ? */
async function reachable(candidate: RenderServer): Promise<RenderStatus | null> {
  try {
    const response = await fetch(`http://${candidate.address}:${candidate.port}/status`, { signal: AbortSignal.timeout(3000) })
    const status = (await response.json()) as RenderStatus
    return status.protocol === RENDER_PROTOCOL ? status : null
  } catch {
    return null
  }
}

function setServer(next: RenderServer | null): void {
  const changed = next?.address !== server?.address || next?.name !== server?.name
  server = next
  if (!changed) return
  notify(next?.name ?? null)
  if (next) {
    settings.server = next
    void saveSettings()
    void resume()
  }
}

async function tryServer(candidate: RenderServer): Promise<void> {
  const status = await reachable(candidate)
  if (status) setServer({ ...candidate, name: status.name })
}

/**
 * Cherche le PC de rendu : par Bonjour, et à sa dernière adresse connue. Puis vérifie toutes les 20 s qu'il répond
 * toujours (le choix disparaît du panneau d'export quand le PC est éteint ou qu'on n'est plus à la maison).
 */
export async function watchRenderServer(onChange: (name: string | null) => void, onExport: (event: ExportEvent) => void): Promise<void> {
  notify = onChange
  sendExport = onExport
  if (existsSync(settingsPath())) {
    try {
      settings = JSON.parse(await readFile(settingsPath(), 'utf8')) as Settings
    } catch {
      settings = {}
    }
  }
  if (settings.server) void tryServer(settings.server)

  const bonjour = new Bonjour()
  const browser = bonjour.find({ type: RENDER_SERVICE_TYPE }, (service) => {
    // L'adresse d'où vient la réponse est sur le réseau du Mac ; le PC en annonce d'autres (machines virtuelles…).
    const address = service.referer?.address ?? service.addresses?.find((a) => a.includes('.'))
    if (address) void tryServer({ name: service.name, address, port: service.port })
  })
  const timer = setInterval(async () => {
    if (server && !(await reachable(server))) setServer(null)
    if (!server) {
      browser.update()
      if (settings.server) void tryServer(settings.server)
    }
  }, 20_000)
  app.on('will-quit', () => {
    clearInterval(timer)
    bonjour.destroy()
  })
}

export const renderServerName = (): string | null => server?.name ?? null

function client(): RenderClient {
  if (!server) throw new Error('Le PC de rendu ne répond plus.')
  return new RenderClient(server, settings.code ?? '')
}

/** Enregistre le code d'appairage s'il est bon. */
export async function setRenderCode(code: string): Promise<boolean> {
  if (!server) return false
  const ok = await new RenderClient(server, code).check()
  if (ok) {
    settings.code = code
    await saveSettings()
  }
  return ok
}

/**
 * Exporte sur le PC de rendu : envoi des fichiers, rendu, réception. Renvoie le chemin de la vidéo, ou `null` si le PC
 * attend son code d'appairage (l'interface le demande, puis relance l'export).
 */
export async function renderRemotely(
  request: ExportRequest,
  onProgress: (fraction: number, step: ExportStep) => void,
  signal: AbortSignal
): Promise<string | null> {
  const remote = client()
  if (!(await remote.check())) return null
  const id = await remote.submit(request.project, request.quality, request.name, request.folder, onProgress, signal)
  followed.add(id)
  try {
    const job = await remote.follow(id, onProgress, signal)
    return await remote.download(job, onProgress, signal)
  } finally {
    followed.delete(id)
  }
}

/**
 * Les rendus finis ou encore en cours pendant que l'app était fermée : on attend leur fin, on range la vidéo là
 * où elle était demandée (dans Exports si ce dossier n'existe plus) et on l'annonce comme un export terminé.
 */
async function resume(): Promise<void> {
  let remote: RenderClient
  let jobs: RenderJob[]
  try {
    remote = client()
    if (!(await remote.check())) return
    jobs = await remote.jobs()
  } catch {
    return
  }
  for (const job of jobs) {
    if (followed.has(job.id) || job.status === 'cancelled') continue
    if (job.status === 'error') {
      void remote.forget(job.id)
      continue
    }
    followed.add(job.id)
    void (async () => {
      try {
        const signal = new AbortController().signal
        const finished = job.status === 'done' ? job : await remote.follow(job.id, () => {}, signal)
        const target = existsSync(finished.folder) ? finished : { ...finished, folder: exportsFolder }
        sendExport({ type: 'done', path: await remote.download(target, () => {}, signal) })
      } catch {
        // On réessaiera au prochain lancement, ou quand le PC reviendra.
      } finally {
        followed.delete(job.id)
      }
    })()
  }
}
