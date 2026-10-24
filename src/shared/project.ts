import type { CaptionLook, ClipDetails, Lane, Project, Segment } from './types'
import type { CaptionDraft } from './captions'

// Opérations pures sur un projet : utilisables partout, faciles à tester, et compatibles avec Immer
// (elles modifient le brouillon reçu).

export const newID = (): string => crypto.randomUUID()

export function emptyProject(): Project {
  return { version: 1, lanes: [videoLane()], segments: [] }
}

function videoLane(name = 'Vidéo'): Lane {
  return { id: newID(), kind: 'video', name, volume: 1, muted: false, normalized: false }
}

/** Durée d'une image posée sur la timeline, avant qu'on la règle. */
export const DEFAULT_IMAGE_DURATION = 5
/** Morceau le plus court qu'on puisse obtenir en rognant une image. */
export const MIN_SEGMENT = 0.1

/** Les pistes vidéo de haut en bas (la première passe par-dessus les autres). */
export function videoLanes(project: Project): Lane[] {
  return project.lanes.filter((l) => l.kind === 'video')
}

/** La piste vidéo visée si c'en est une, sinon la plus basse (créée si le projet n'en a aucune). */
function targetVideoLane(project: Project, laneId?: string): Lane {
  const lanes = videoLanes(project)
  const target = lanes.find((l) => l.id === laneId) ?? lanes.at(-1)
  if (target) return target
  const lane = videoLane()
  project.lanes.unshift(lane)
  return lane
}

/** Ajoute une piste vidéo tout en haut (« Vidéo 2 », « Vidéo 3 »…), donc au premier plan. Renvoie son identifiant. */
export function addVideoLane(project: Project): string {
  const names = new Set(project.lanes.map((l) => l.name))
  let index = 2
  while (names.has(`Vidéo ${index}`)) index++
  const lane = videoLane(`Vidéo ${index}`)
  project.lanes.unshift(lane)
  return lane.id
}

export function projectDuration(project: Project): number {
  return project.segments.reduce((end, s) => Math.max(end, s.start + s.duration), 0)
}

export function segmentsIn(project: Project, laneId: string): Segment[] {
  return project.segments.filter((s) => s.laneId === laneId).sort((a, b) => a.start - b.start)
}

/** La piste audio qui porte ce nom, créée si besoin. */
export function audioLane(project: Project, name: string): Lane {
  let lane = project.lanes.find((l) => l.kind === 'audio' && l.name === name)
  if (!lane) {
    lane = { id: newID(), kind: 'audio', name, volume: 1, muted: false, normalized: true }
    project.lanes.push(lane)
  }
  return lane
}

/**
 * Pose un clip à `time` : un morceau vidéo et un morceau par piste audio, tous liés.
 * Ce qui se trouvait déjà à cet endroit sur ces pistes est recouvert (raccourci ou coupé).
 */
export function insertClip(project: Project, clip: ClipDetails, time: number, laneId?: string): void {
  const linkId = newID()
  const start = Math.max(0, time)
  const placed: Segment[] = []
  const video = targetVideoLane(project, laneId)
  const piece = (laneId: string, stream: number): Segment => ({
    id: newID(), laneId, source: clip.path, stream, sourceStart: 0, duration: clip.duration, start, linkId
  })
  if (clip.videoStream !== null) placed.push(piece(video.id, clip.videoStream))
  for (const track of clip.audioTracks) placed.push(piece(audioLane(project, track.name).id, track.stream))

  for (const segment of placed) clearRange(project, segment.laneId, segment.start, segment.start + segment.duration)
  project.segments.push(...placed)
}

/**
 * Libère `start..end` sur une piste : les morceaux sont raccourcis, coupés en deux ou retirés.
 * Les morceaux de `except` (ceux qu'on est en train de poser) ne sont pas touchés.
 */
export function clearRange(project: Project, laneId: string, start: number, end: number, except?: Set<string>): void {
  const result: Segment[] = []
  for (const segment of project.segments) {
    const segmentEnd = segment.start + segment.duration
    if (segment.laneId !== laneId || segment.start >= end || segmentEnd <= start || except?.has(segment.id)) {
      result.push(segment)
      continue
    }
    if (segment.start < start) result.push({ ...segment, duration: start - segment.start })
    if (segmentEnd > end) {
      result.push({
        ...segment,
        id: segment.start < start ? newID() : segment.id,
        sourceStart: segment.sourceStart + (end - segment.start),
        duration: segmentEnd - end,
        start: end
      })
    }
  }
  project.segments = result
}

/** Les instants où un morceau peut s'aimanter : début de la timeline et bords des morceaux (sauf ceux de `except`). */
export function snapTimes(project: Project, except?: Set<string>): number[] {
  const times = new Set<number>([0])
  for (const s of project.segments) {
    if (except?.has(s.id)) continue
    times.add(s.start)
    times.add(s.start + s.duration)
  }
  return [...times].sort((a, b) => a - b)
}

/** Les morceaux donnés, plus tous ceux qui leur sont liés. */
export function withLinked(project: Project, ids: Iterable<string>): Set<string> {
  const wanted = new Set(ids)
  const links = new Set(project.segments.filter((s) => wanted.has(s.id) && s.linkId).map((s) => s.linkId))
  for (const s of project.segments) if (s.linkId && links.has(s.linkId)) wanted.add(s.id)
  return wanted
}

/** En dessous de ce morceau (en secondes), une coupe ne crée rien : on ne fabrique pas de morceaux invisibles. */
const MIN_PIECE = 1 / 120

/**
 * Coupe au temps `time` les morceaux `ids` et ceux qui leur sont liés, ou, si `ids` est vide, tous les morceaux sous le curseur.
 * Les deux moitiés d'un groupe lié restent liées entre elles, chacune de son côté. Renvoie les morceaux de droite.
 */
export function splitAt(project: Project, ids: Iterable<string>, time: number): string[] {
  const chosen = withLinked(project, ids)
  const everything = chosen.size === 0
  const newLinks = new Map<string, string>()
  const created: string[] = []
  const result: Segment[] = []
  for (const segment of project.segments) {
    const end = segment.start + segment.duration
    const inside = time - segment.start > MIN_PIECE && end - time > MIN_PIECE
    if (!inside || (!everything && !chosen.has(segment.id))) {
      result.push(segment)
      continue
    }
    let linkId: string | null = null
    if (segment.linkId) {
      linkId = newLinks.get(segment.linkId) ?? newID()
      newLinks.set(segment.linkId, linkId)
    }
    const right: Segment = {
      ...segment,
      id: newID(),
      start: time,
      sourceStart: segment.sourceStart + (time - segment.start),
      duration: end - time,
      linkId
    }
    const left = { ...segment, duration: time - segment.start }
    if (segment.caption) {
      // Un sous-titre coupé garde ses mots de chaque côté, recalés sur le début de chaque moitié.
      const at = time - segment.start
      left.caption = { words: segment.caption.words.filter((w) => w.start < at) }
      right.caption = { words: segment.caption.words.filter((w) => w.start >= at).map((w) => ({ ...w, start: w.start - at, end: w.end - at })) }
    }
    result.push(left, right)
    created.push(right.id)
  }
  project.segments = result
  return created
}

/**
 * Supprime des morceaux. Avec `closeGap`, la suite de la timeline recule pour refermer le trou laissé,
 * sur toutes les pistes à la fois (pour que l'image et le son restent calés).
 */
export function removeSegments(project: Project, ids: Set<string>, closeGap: boolean): void {
  const removed = project.segments.filter((s) => ids.has(s.id))
  if (removed.length === 0) return
  project.segments = project.segments.filter((s) => !ids.has(s.id))
  if (!closeGap) return
  const from = Math.min(...removed.map((s) => s.start))
  const to = Math.max(...removed.map((s) => s.start + s.duration))
  // On ne recule que si le trou est vraiment libre sur toutes les pistes.
  const blocked = project.segments.some((s) => s.start < to - MIN_PIECE && s.start + s.duration > from + MIN_PIECE)
  if (blocked) return
  for (const s of project.segments) if (s.start >= to - MIN_PIECE) s.start -= to - from
}

/** Décale des morceaux dans le temps ; ce qu'ils recouvrent à l'arrivée est raccourci ou retiré. */
export function moveSegments(project: Project, ids: Set<string>, delta: number): void {
  const moved = project.segments.filter((s) => ids.has(s.id))
  const shift = Math.max(delta, -Math.min(...moved.map((s) => s.start)))
  for (const s of moved) s.start += shift
  for (const s of moved) clearRange(project, s.laneId, s.start, s.start + s.duration, ids)
}

/** ⌘L : si la sélection contient des morceaux liés, on les délie tous ; sinon on les lie ensemble. */
export function toggleLink(project: Project, ids: Set<string>): void {
  const selected = project.segments.filter((s) => ids.has(s.id))
  if (selected.length === 0) return
  const linked = selected.some((s) => s.linkId)
  const linkId = linked || selected.length < 2 ? null : newID()
  for (const s of selected) s.linkId = linkId
}

/**
 * Pose un fichier audio (fond sonore) à `time`, sur la piste `laneId` si c'est une piste de fond sonore,
 * sinon sur une nouvelle piste au nom du fichier. Renvoie la piste utilisée.
 */
export function insertAudioFile(project: Project, file: ClipDetails, time: number, laneId?: string): string | null {
  const track = file.audioTracks[0]
  if (!track) return null
  let lane = laneId ? project.lanes.find((l) => l.id === laneId && l.music) : undefined
  if (!lane) {
    lane = { id: newID(), kind: 'audio', name: track.name, volume: 1, muted: false, normalized: true, music: true }
    project.lanes.push(lane)
  }
  const start = Math.max(0, time)
  clearRange(project, lane.id, start, start + file.duration)
  project.segments.push({
    id: newID(), laneId: lane.id, source: file.path, stream: track.stream, sourceStart: 0, duration: file.duration, start, linkId: null
  })
  return lane.id
}

/** Retire une piste et tout ce qu'elle contient. */
export function removeLane(project: Project, laneId: string): void {
  project.lanes = project.lanes.filter((l) => l.id !== laneId)
  project.segments = project.segments.filter((s) => s.laneId !== laneId)
}

/** Ajoute une piste de fond sonore vide (« Bande son », « Bande son 2 »…). Renvoie son identifiant. */
export function addMusicLane(project: Project): string {
  const names = new Set(project.lanes.map((l) => l.name))
  let name = 'Bande son'
  for (let index = 2; names.has(name); index++) name = `Bande son ${index}`
  const lane: Lane = { id: newID(), kind: 'audio', name, volume: 1, muted: false, normalized: true, music: true }
  project.lanes.push(lane)
  return lane.id
}

/** Pose une image fixe à `time` sur la piste vidéo visée (sinon la plus basse). Renvoie la piste utilisée. */
export function insertImage(project: Project, image: ClipDetails, time: number, laneId?: string): string {
  const lane = targetVideoLane(project, laneId)
  const start = Math.max(0, time)
  const duration = image.duration > 0 ? image.duration : DEFAULT_IMAGE_DURATION
  clearRange(project, lane.id, start, start + duration)
  project.segments.push({
    id: newID(), laneId: lane.id, source: image.path, stream: 0, sourceStart: 0, duration, start, linkId: null, image: true
  })
  return lane.id
}

/**
 * Rogne ou allonge un morceau par un de ses bords. Une image s'allonge librement ; un clip reste dans les limites
 * de sa source (`sourceDuration`). Ce que le morceau recouvre ensuite sur sa piste est raccourci.
 */
export function trimSegment(project: Project, id: string, edge: 'start' | 'end', delta: number, sourceDuration = Infinity): void {
  const segment = project.segments.find((s) => s.id === id)
  if (!segment) return
  const end = segment.start + segment.duration
  // Une image ou un sous-titre n'ont pas de source à respecter : leur durée est libre.
  const free = segment.image || segment.caption
  if (edge === 'end') {
    const room = free ? Infinity : sourceDuration - segment.sourceStart
    segment.duration = Math.min(room, Math.max(MIN_SEGMENT, segment.duration + delta))
  } else {
    const earliest = free ? 0 : Math.max(0, segment.start - segment.sourceStart)
    const start = Math.min(end - MIN_SEGMENT, Math.max(earliest, segment.start + delta))
    const shift = start - segment.start
    if (!free) segment.sourceStart += shift
    if (segment.caption) {
      // Les mots gardent leur instant sur la timeline : ceux qui tombent avant le nouveau début disparaissent.
      segment.caption.words = segment.caption.words.filter((w) => w.end > shift).map((w) => ({ ...w, start: Math.max(0, w.start - shift), end: w.end - shift }))
    }
    segment.start = start
    segment.duration = end - start
  }
  clearRange(project, segment.laneId, segment.start, segment.start + segment.duration, new Set([id]))
}

/** Piste de sous-titres d'une piste audio (« Sous-titres · Micro »), créée tout en haut si besoin. */
export function captionLane(project: Project, name: string, look: CaptionLook): string {
  const existing = project.lanes.find((l) => l.kind === 'caption' && l.name === name)
  if (existing) return existing.id
  const lane: Lane = { id: newID(), kind: 'caption', name, volume: 1, muted: false, normalized: false, look }
  project.lanes.unshift(lane)
  return lane.id
}

/** Remplace les sous-titres d'une piste sur la durée couverte par les nouveaux. */
export function placeCaptions(project: Project, laneId: string, drafts: CaptionDraft[]): void {
  for (const draft of drafts) clearRange(project, laneId, draft.start, draft.end)
  for (const draft of drafts) {
    project.segments.push({
      id: newID(), laneId, source: '', stream: -1, sourceStart: 0, start: draft.start, duration: Math.max(MIN_SEGMENT, draft.end - draft.start),
      linkId: null, caption: { words: draft.words }
    })
  }
}

/** Le texte d'un sous-titre, tel qu'on l'écrit et le modifie. */
export function captionText(segment: Segment): string {
  return segment.caption?.words.map((w) => w.text).join(' ') ?? ''
}

/**
 * Change le texte d'un sous-titre. Si le nombre de mots ne change pas, chaque mot garde ses temps ; sinon les mots
 * se répartissent régulièrement sur la durée du sous-titre.
 */
export function setCaptionText(project: Project, id: string, text: string): void {
  const segment = project.segments.find((s) => s.id === id)
  if (!segment?.caption) return
  const words = text.trim().split(/\s+/).filter(Boolean)
  const old = segment.caption.words
  segment.caption.words =
    words.length === old.length
      ? old.map((w, i) => ({ ...w, text: words[i]! }))
      : words.map((word, i) => ({ text: word, start: (i * segment.duration) / words.length, end: ((i + 1) * segment.duration) / words.length }))
}
