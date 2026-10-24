// Types partagés entre le processus principal (Node) et l'interface (React).
// Tous les temps sont en secondes.

/** Un fichier de la bibliothèque : un clip vidéo (dossier des clips) ou un son importé (bande son). */
export interface LibraryFile {
  path: string
  kind: 'video' | 'audio'
  createdAt: number
  modifiedAt: number
  size: number
}

/** Une piste audio montable d'un clip (Micro, Minecraft, Discord…). */
export interface AudioTrackInfo {
  /** Index du flux pour FFmpeg (`-map 0:<stream>`). */
  stream: number
  name: string
  channels: number
  /** Codec FFmpeg (« aac », « mp3 »…) : l'AAC est extrait tel quel, le reste est converti. */
  codec: string
}

/** Ce que FFmpeg et l'en-tête MP4 nous apprennent d'un clip. */
export interface ClipDetails {
  path: string
  duration: number
  width: number
  height: number
  /** Index du flux vidéo, null pour un fichier sans image. */
  videoStream: number | null
  /** Les pistes à monter : les sources séparées de ReplayClip si elles existent, sinon toutes. */
  audioTracks: AudioTrackInfo[]
}

export type LaneKind = 'video' | 'audio'

export interface Lane {
  id: string
  kind: LaneKind
  name: string
  /** De 0 à 2 (200 %). */
  volume: number
  muted: boolean
  /** Prise en compte par le bouton « Normaliser ». */
  normalized: boolean
  /** Piste de fond sonore ajoutée à la main (renommable, supprimable). Absente des anciens projets. */
  music?: boolean
}

/** Un morceau posé sur une piste : une plage d'un flux d'un fichier source, placée à un instant de la timeline. */
export interface Segment {
  id: string
  laneId: string
  source: string
  stream: number
  /** Début de la plage dans le fichier source. */
  sourceStart: number
  duration: number
  /** Position sur la timeline. */
  start: number
  /** Les morceaux qui partagent un `linkId` bougent, se coupent et se suppriment ensemble. */
  linkId: string | null
}

/** Un montage. Il ne contient que des références aux clips d'origine : les sources ne sont jamais réécrites. */
export interface Project {
  version: 1
  lanes: Lane[]
  segments: Segment[]
}

/** Le projet ouvert et l'endroit où il est enregistré. */
export interface OpenedProject {
  path: string
  project: Project
}

/** « source » : la taille des clips d'origine ; « 1080p » : 1080 lignes, même format d'image. */
export type ExportQuality = 'source' | '1080p'

export interface ExportRequest {
  project: Project
  folder: string
  name: string
  quality: ExportQuality
}

/** Ce que l'interface apprend de l'export en cours. */
export type ExportEvent =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; path: string }
  | { type: 'error'; message: string }
  | { type: 'cancelled' }

/** Actions envoyées par le menu de l'app à l'interface. */
export type MenuAction =
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-fit'
  | 'undo'
  | 'redo'
  | 'select-all'
  | 'split'
  | 'delete'
  | 'delete-close-gap'
  | 'toggle-link'
  | 'export'

/** Ce que le preload expose à l'interface sous `window.api`. */
export interface EasyEditAPI {
  listFiles(): Promise<LibraryFile[]>
  clipDetails(path: string): Promise<ClipDetails>
  /** URL `media://` d'une vignette JPEG, générée puis gardée en cache. */
  thumbnail(path: string): Promise<string>
  /** URL `media://` d'une piste audio extraite du clip, gardée en cache. */
  audioTrack(path: string, stream: number): Promise<string>
  /** Copie des sons dans la bibliothèque ; renvoie leurs nouveaux chemins (les fichiers non audio sont ignorés). */
  importSounds(paths: string[]): Promise<string[]>
  /** Fenêtre de choix de sons, importés dans la bibliothèque ; renvoie leurs nouveaux chemins. */
  pickSounds(): Promise<string[]>
  /** Chemin d'un fichier glissé depuis le Finder. */
  pathForFile(file: File): string
  /** URL `media://` pour lire directement un fichier. */
  mediaURL(path: string): string
  loadInitialProject(): Promise<OpenedProject>
  saveProject(opened: OpenedProject): Promise<void>
  newProject(): Promise<OpenedProject>
  openProject(): Promise<OpenedProject | null>
  revealInFinder(path: string): Promise<void>
  /** Ouvre le dossier des clips dans le Finder (créé s'il n'existe pas). */
  openClipsFolder(): Promise<void>
  /** Appelé quand un projet est ouvert ou créé depuis le menu. */
  onProjectOpened(callback: (opened: OpenedProject) => void): () => void
  onMenu(callback: (action: MenuAction) => void): () => void
  /** Dossier proposé par défaut pour les exports. */
  exportsFolder(): Promise<string>
  /** Choix d'un dossier ; null si on annule. */
  pickFolder(current: string): Promise<string | null>
  /** Lance l'export ; la suite arrive par `onExport`. */
  startExport(request: ExportRequest): Promise<void>
  cancelExport(): Promise<void>
  onExport(callback: (event: ExportEvent) => void): () => void
}
