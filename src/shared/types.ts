// Types partagés entre le processus principal (Node) et l'interface (React).
// Tous les temps sont en secondes.

/** Un fichier de la bibliothèque : un clip vidéo (dossier des clips), un son ou une image importés. */
export interface LibraryFile {
  path: string
  kind: 'video' | 'audio' | 'image'
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
  /** Pour une image : la durée proposée quand on la pose sur la timeline. */
  duration: number
  /** Image fixe (png, jpg…) : un seul « flux » vidéo, sans son, de durée libre. */
  image?: boolean
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
  /**
   * Piste de sous-titres (une piste vidéo comme les autres : elle s'empile, se déplace et se redimensionne) :
   * le style et la couleur d'accent de ses sous-titres.
   */
  look?: CaptionLook
  /** Piste vidéo : flou de mouvement appliqué à l'export (plugin « Motion blur »). Absent : pas de flou. */
  motionBlur?: MotionBlur
}

/** Réglages du flou de mouvement d'une piste vidéo (voir `src/shared/motion-blur.ts`). */
export interface MotionBlur {
  /** Coupé, le flou garde ses réglages pour quand on le rallume. */
  enabled: boolean
  /** Durée d'obturation, de 0 à 1 (0,5 : obturateur à 180°). */
  amount: number
  /** Images intermédiaires calculées entre deux vraies images. */
  quality: 4 | 8 | 16
  /** « gaussian » : les images proches de l'instant montré comptent plus, le flou est plus doux. */
  weighting: 'equal' | 'gaussian'
  /** Cadence des images floutées. */
  fps: 60 | 30
}

/** Style des sous-titres d'une piste (voir `CAPTION_STYLES`) et couleur du mot prononcé (`null` : sans accent). */
export interface CaptionLook {
  style: 'classique' | 'bandeau' | 'impact' | 'mot'
  accent: string | null
}

/** Un mot d'un sous-titre, en secondes depuis le début du sous-titre. */
export interface CaptionWord {
  text: string
  start: number
  end: number
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
  /** Image fixe : `sourceStart` ne sert pas et la durée se règle librement. */
  image?: boolean
  /** Taille et position dans l'image (morceaux vidéo et images). Absent : ajusté et centré. */
  transform?: Transform
  /** Rognage, en fractions du média de chaque côté. Absent : rien n'est rogné. */
  crop?: Crop
  /** Sous-titre : ses mots, avec leurs temps. `source` est alors vide. Placé dans l'image par `transform` (pas de `crop`). */
  caption?: { words: CaptionWord[] }
}

/** `x`, `y` : décalage du centre en fractions de l'image ; `scale` : 1 = ajusté dans l'image sans déformation. */
export interface Transform {
  x: number
  y: number
  scale: number
}

export interface Crop {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Un montage. Il ne contient que des références aux clips d'origine : les sources ne sont jamais réécrites.
 * L'ordre de `lanes` est l'ordre d'affichage, de haut en bas : les pistes vidéo d'abord, et la plus haute
 * passe par-dessus les autres dans l'image.
 */
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
  /** Rendu sur le PC Linux de la maison plutôt que sur cet ordinateur. */
  remote: boolean
}

/**
 * Étape d'un export : envoi des fichiers au PC de rendu, motion blur, encodage de la vidéo finale, réception de la
 * vidéo depuis le PC de rendu.
 */
export type ExportStep = 'upload' | 'blur' | 'encode' | 'download'

/** Ce que l'interface apprend de l'export en cours. */
export type ExportEvent =
  | { type: 'progress'; fraction: number; step: ExportStep }
  | { type: 'done'; path: string }
  | { type: 'error'; message: string }
  | { type: 'cancelled' }
  /** Le PC de rendu attend son code d'appairage : l'interface le demande, puis relance l'export. */
  | { type: 'code-needed' }

/** Étape d'une transcription : téléchargement du modèle (la première fois), chargement, transcription. */
export type TranscribePhase = 'download' | 'load' | 'transcribe'

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
  | 'fullscreen'
  | 'monitor'
  | 'transcribe'
  | 'motion-blur'

/** Horloge de lecture envoyée au deuxième écran : `at` est l'instant de la mesure (ms depuis 1970, haute précision). */
export interface MonitorClock {
  time: number
  rate: number
  at: number
}

/** Ce que la fenêtre principale envoie à celle du deuxième écran (seulement ce qui a changé). */
export interface MonitorState {
  project?: Project
  /** Format de l'image, par exemple « 1728 / 1080 ». */
  ratio?: string
  clock?: MonitorClock
}

/** Ce que le preload expose à l'interface sous `window.api`. */
export interface EasyEditAPI {
  /** Système de l'ordinateur : les raccourcis et la barre de titre en dépendent. */
  platform: 'darwin' | 'win32' | 'linux'
  /** Sur Windows, ouvre le menu de l'app sous le logo (coordonnées de la fenêtre). */
  popupMenu(x: number, y: number): Promise<void>
  listFiles(): Promise<LibraryFile[]>
  clipDetails(path: string): Promise<ClipDetails>
  /** URL `media://` d'une vignette JPEG, générée puis gardée en cache. */
  thumbnail(path: string): Promise<string>
  /** URL `media://` d'une piste audio extraite du clip, gardée en cache. */
  audioTrack(path: string, stream: number): Promise<string>
  /** Copie des vidéos, des sons et des images dans la bibliothèque ; renvoie leurs nouveaux chemins (les autres fichiers sont ignorés). */
  importFiles(paths: string[]): Promise<string[]>
  /** Fenêtre de choix de vidéos, de sons et d'images, importés dans la bibliothèque ; renvoie leurs nouveaux chemins. */
  pickFiles(): Promise<string[]>
  /** Chemin d'un fichier glissé depuis le Finder ou l'Explorateur. */
  pathForFile(file: File): string
  /** URL `media://` pour lire directement un fichier. */
  mediaURL(path: string): string
  loadInitialProject(): Promise<OpenedProject>
  saveProject(opened: OpenedProject): Promise<void>
  newProject(): Promise<OpenedProject>
  openProject(): Promise<OpenedProject | null>
  revealFile(path: string): Promise<void>
  /** Ouvre le dossier des clips (créé s'il n'existe pas). */
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
  /** Nom du PC de rendu s'il répond sur le réseau (« PC Linux »), sinon null ; `onRenderServer` suit les changements. */
  renderServer(): Promise<string | null>
  onRenderServer(callback: (name: string | null) => void): () => void
  /** Enregistre le code d'appairage du PC de rendu ; false s'il est faux. */
  setRenderCode(code: string): Promise<boolean>
  /** Transcrit un son mono à 16 kHz (Voz, sur l'ordinateur) ; mots en secondes depuis son début. */
  transcribe(samples: Float32Array): Promise<{ text: string; start: number; end: number }[]>
  onTranscribeProgress(callback: (progress: { phase: TranscribePhase; fraction: number | null }) => void): () => void
  /** Met la fenêtre en plein écran (sans changer d'espace sur macOS) ou l'en sort. */
  setFullScreen(on: boolean): Promise<void>
  /** Un autre écran que celui de la fenêtre est-il branché ? */
  hasOtherDisplay(): Promise<boolean>
  onOtherDisplay(callback: (present: boolean) => void): () => void
  /** Ouvre ou ferme l'aperçu sur l'autre écran ; `onMonitor` dit s'il est ouvert. */
  setMonitor(open: boolean): Promise<void>
  onMonitor(callback: (open: boolean) => void): () => void
  /** Fenêtre principale → deuxième écran (relayé par le processus principal). */
  sendMonitor(state: MonitorState): void
  onMonitorState(callback: (state: MonitorState) => void): () => void
  /** Le deuxième écran demande l'état complet (à son ouverture). */
  monitorReady(): void
  onMonitorReady(callback: () => void): () => void
}
