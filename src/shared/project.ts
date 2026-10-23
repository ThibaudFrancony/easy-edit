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

/** Libère `start..end` sur une piste : les morceaux sont raccourcis, coupés en deux ou retirés. */
export function clearRange(project: Project, laneId: string, start: number, end: number): void {
  const result: Segment[] = []
  for (const segment of project.segments) {
    const segmentEnd = segment.start + segment.duration
    if (segment.laneId !== laneId || segment.start >= end || segmentEnd <= start) {
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

/** Les instants où un morceau peut s'aimanter : début de la timeline et bords des morceaux. */
export function snapTimes(project: Project): number[] {
  const times = new Set<number>([0])
  for (const s of project.segments) {
    times.add(s.start)
    times.add(s.start + s.duration)
  }
  return [...times].sort((a, b) => a - b)
}
