import type { ClipDetails, Lane, Project, Segment } from './types'

// Opérations pures sur un projet : utilisables partout, faciles à tester, et compatibles avec Immer
// (elles modifient le brouillon reçu).

export const newID = (): string => crypto.randomUUID()

export function emptyProject(): Project {
  return { version: 1, lanes: [videoLane()], segments: [] }
}

function videoLane(): Lane {
  return { id: newID(), kind: 'video', name: 'Vidéo', volume: 1, muted: false, normalized: false }
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
export function insertClip(project: Project, clip: ClipDetails, time: number): void {
  const linkId = newID()
  const start = Math.max(0, time)
  const placed: Segment[] = []
  let video = project.lanes.find((l) => l.kind === 'video')
  if (!video) {
    video = videoLane()
    project.lanes.unshift(video)
  }
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
    result.push({ ...segment, duration: time - segment.start }, right)
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
