import type { ClipDetails, Lane } from '@shared/types'
import {
  addMusicLane, addVideoLane, insertAudioFile, insertClip, insertImage, moveSegments, removeLane, removeSegments, splitAt, toggleLink, trimSegment
} from '@shared/project'
import { measureLoudness, normalizationGains } from '@/engine/loudness'
import { player } from '@/engine/player'
import { clipDetails } from './library'
import { useProject } from './project'
import { instantLayout, useTimeline } from './timeline'

// Les actions de montage, appelées par le menu Montage, les raccourcis et le clic droit.

const selection = (): Set<string> => useTimeline.getState().selection

/** S : coupe la sélection (et ce qui lui est lié) au curseur ; sans sélection, tout ce qui est sous le curseur. */
export function splitAtPlayhead(): void {
  const time = player.time()
  useProject.getState().update((draft) => {
    splitAt(draft, selection(), time)
  })
}

/** ⌫ laisse un trou ; ⇧⌫ referme le trou en faisant reculer la suite. */
export function deleteSelection(closeGap: boolean): void {
  const ids = selection()
  if (ids.size === 0) return
  useProject.getState().update((draft) => removeSegments(draft, ids, closeGap))
  useTimeline.getState().setSelection(new Set())
}

export function toggleLinkSelection(): void {
  const ids = selection()
  if (ids.size === 0) return
  useProject.getState().update((draft) => toggleLink(draft, ids))
}

export function selectAll(): void {
  useTimeline.getState().setSelection(new Set(useProject.getState().project.segments.map((s) => s.id)))
}

/** Fin d'un déplacement à la souris : les morceaux sont déjà affichés à leur place, ils n'ont pas à y glisser. */
export function commitDrag(): void {
  const { drag, setDrag } = useTimeline.getState()
  if (!drag) return
  if (Math.abs(drag.delta) > 1e-6) {
    instantLayout()
    useProject.getState().update((draft) => moveSegments(draft, drag.ids, drag.delta))
  }
  setDrag(null)
}

/** Retire de la sélection les morceaux qui n'existent plus (après une suppression, une annulation…). */
export function pruneSelection(): void {
  const { selection: current, setSelection, inspectedLane, inspect } = useTimeline.getState()
  if (inspectedLane && !useProject.getState().project.lanes.some((l) => l.id === inspectedLane)) inspect(null)
  if (current.size === 0) return
  const existing = new Set(useProject.getState().project.segments.map((s) => s.id))
  const kept = new Set([...current].filter((id) => existing.has(id)))
  if (kept.size !== current.size) setSelection(kept)
}

// ——— Pistes ———

function updateLane(laneId: string, change: (lane: Lane) => void, mergeKey?: string): void {
  useProject.getState().update((draft) => {
    const lane = draft.lanes.find((l) => l.id === laneId)
    if (lane) change(lane)
  }, mergeKey)
}

/** Volume de 0 à 2 : les crans successifs d'un même glissé ne font qu'une étape d'annulation. */
export function setLaneVolume(laneId: string, volume: number): void {
  updateLane(laneId, (lane) => (lane.volume = Math.min(2, Math.max(0, volume))), `volume:${laneId}`)
}

export function toggleLaneMute(laneId: string): void {
  updateLane(laneId, (lane) => (lane.muted = !lane.muted))
}

export function toggleLaneNormalized(laneId: string): void {
  updateLane(laneId, (lane) => (lane.normalized = !lane.normalized))
}

export function renameLane(laneId: string, name: string): void {
  const trimmed = name.trim()
  if (trimmed) updateLane(laneId, (lane) => (lane.name = trimmed))
}

/** Boutons sous les pistes : une piste vide, vidéo (ajoutée tout en haut, au premier plan) ou audio (en bas). */
export function addEmptyLane(kind: 'video' | 'audio'): void {
  let laneId = ''
  useProject.getState().update((draft) => {
    laneId = kind === 'video' ? addVideoLane(draft) : addMusicLane(draft)
  })
  useTimeline.getState().inspect(laneId)
}

/**
 * Pose sur la timeline ce qu'on y dépose (clips, images, sons), à `time`, sur la piste visée si elle convient.
 * Une seule étape d'annulation par fichier.
 */
export async function placeFiles(paths: string[], time: number, laneId?: string): Promise<void> {
  const sounds: string[] = []
  let at = time
  for (const path of paths) {
    const details = await clipDetails(path)
    if (details.image) {
      useProject.getState().update((draft) => void insertImage(draft, details, at, laneId))
    } else if (details.videoStream !== null) {
      useProject.getState().update((draft) => insertClip(draft, details, at, laneId))
    } else {
      sounds.push(path)
      continue
    }
    at += details.duration
  }
  if (sounds.length > 0) await addAudioFiles(sounds, at, laneId)
}

/** Fin d'un rognage à la souris (bord d'une image ou d'un morceau). */
export function commitTrim(): void {
  const { trim, setTrim } = useTimeline.getState()
  if (!trim) return
  if (Math.abs(trim.delta) > 1e-6) {
    instantLayout()
    useProject.getState().update((draft) => trimSegment(draft, trim.id, trim.edge, trim.delta, trim.sourceDuration))
  }
  setTrim(null)
}

export function deleteLane(laneId: string): void {
  useTimeline.getState().inspect(null)
  useProject.getState().update((draft) => removeLane(draft, laneId))
}

/**
 * Pose des fichiers audio les uns à la suite des autres à partir de `time`, sur la piste de fond sonore `laneId`
 * (sinon une nouvelle piste par fichier). Une seule étape d'annulation.
 */
export async function addAudioFiles(paths: string[], time: number, laneId?: string): Promise<void> {
  const files = (await Promise.all(paths.map((path) => window.api.clipDetails(path).catch(() => null)))).filter(
    (file): file is ClipDetails => file !== null && file.audioTracks.length > 0
  )
  if (files.length === 0) return
  let added: string | null = null
  useProject.getState().update((draft) => {
    let at = time
    for (const file of files) {
      // Le premier fichier crée la piste si besoin, les suivants s'y enchaînent.
      added = insertAudioFile(draft, file, at, laneId ?? added ?? undefined) ?? added
      at += file.duration
    }
  })
  if (added) useTimeline.getState().inspect(added)
}

/** Bouton « Normaliser » : mesure chaque piste incluse sur ce qui est utilisé, puis règle les volumes pour qu'elles sonnent pareil. */
export async function normalizeLanes(): Promise<void> {
  const { project } = useProject.getState()
  const lanes = project.lanes.filter((l) => l.kind === 'audio' && l.normalized && !l.muted)
  const levels = new Map<string, number | null>()
  await Promise.all(
    lanes.map(async (lane) => {
      const ranges = await Promise.all(
        project.segments
          .filter((s) => s.laneId === lane.id)
          .map(async (s) => {
            const buffer = await player.audioBuffer(s.source, s.stream)
            return buffer ? { buffer, start: s.sourceStart, duration: s.duration } : null
          })
      )
      levels.set(lane.id, measureLoudness(ranges.filter((r) => r !== null)))
    })
  )
  const gains = normalizationGains(levels)
  if (gains.size === 0) return
  useProject.getState().update((draft) => {
    for (const lane of draft.lanes) {
      const gain = gains.get(lane.id)
      if (gain !== undefined) lane.volume = gain
    }
  })
}
