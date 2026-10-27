import type { ExportQuality, ExportStep, Project } from './types'

// Ce que l'app et le service de rendu du PC Linux se disent, en HTTP sur le réseau de la maison.
// Le PC s'annonce par Bonjour (`_easyedit-render._tcp`). Chaque requête, sauf `GET /status`, porte le code
// d'appairage dans l'en-tête `RENDER_CODE_HEADER`.
//
//   GET    /status               état du service (RenderStatus)
//   GET    /check                204 si le code est bon
//   HEAD   /files/<nom>          200 si le PC a déjà ce fichier
//   PUT    /files/<nom>          envoi d'un fichier (corps brut) ; le nom est son empreinte, vérifiée à l'arrivée
//   POST   /jobs                 nouveau rendu (RenderJobRequest) → { id }
//   GET    /jobs                 les rendus gardés (RenderJob[])
//   GET    /jobs/<id>/events     progression en direct (Server-Sent Events, un RenderJob par message)
//   GET    /jobs/<id>/output     la vidéo finie
//   DELETE /jobs/<id>            annule un rendu, ou l'oublie une fois la vidéo récupérée

/** Change quand l'app et le service ne se comprennent plus : l'app ignore alors un service d'une autre version. */
export const RENDER_PROTOCOL = 1
export const RENDER_SERVICE_TYPE = 'easyedit-render'
export const RENDER_PORT = 7171
/** Le PC de la maison, par son nom : essayé quand Bonjour ne répond pas (réseau qui bloque la multidiffusion). */
export const RENDER_HOST = 'whorespace.local'
export const RENDER_CODE_HEADER = 'x-easy-edit-code'

export interface RenderStatus {
  /** Nom affiché dans le panneau d'export (« PC Linux »). */
  name: string
  protocol: number
}

/**
 * Un rendu demandé par l'app. Les `source` des morceaux sont des noms de fichiers envoyés (`remoteFileName`).
 * `folder` et `name` disent où ranger la vidéo sur le Mac, pour la récupérer même après une fermeture de l'app.
 */
export interface RenderJobRequest {
  project: Project
  quality: ExportQuality
  name: string
  folder: string
}

export interface RenderJob {
  id: string
  name: string
  folder: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  fraction: number
  step: ExportStep
  error?: string
  createdAt: number
}

/** Nom d'un fichier chez le service : son empreinte SHA-256 et son extension (FFmpeg et l'analyse en ont besoin). */
export const remoteFileName = (sha256: string, extension: string): string => `${sha256}${extension.toLowerCase()}`

export const REMOTE_FILE_NAME = /^[0-9a-f]{64}\.[a-z0-9]{1,5}$/
