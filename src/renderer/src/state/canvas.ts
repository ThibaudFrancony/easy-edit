import { create } from 'zustand'
import type { Crop, Project, Segment, Transform } from '@shared/types'
import { MIN_VISIBLE, NO_CROP, NO_TRANSFORM, type Rect } from '@shared/geometry'
import { player } from '@/engine/player'
import { useProject } from './project'

// Cadrage d'un morceau dans l'image : redimensionner (taille et position) ou rogner, directement sur l'aperçu.

export type FrameMode = 'resize' | 'crop'

/**
 * Ce que chaque piste vidéo montre en ce moment dans l'aperçu, et le format de son média (tenu à jour à chaque image
 * par l'aperçu) : sert à savoir quelle piste est sous le pointeur et à placer les poignées de cadrage. Un sous-titre
 * n'a pas de format : on mesure directement la place de son texte (`rect`, en fractions de l'image).
 */
export const onPreview = new Map<string, { segment: Segment; mediaAspect: number; rect?: Rect }>()

interface CanvasState {
  /** Le morceau dont on règle le cadrage sur l'aperçu, et comment. */
  editing: { segmentId: string; mode: FrameMode } | null
  /**
   * Clic droit : le menu et ce qu'il vise, un morceau (choisi dans la timeline ou sous le pointeur dans l'aperçu)
   * ou une piste (son en-tête).
   */
  menu: { x: number; y: number; segmentId: string | null; laneId?: string } | null
  /** Change quand la place mesurée d'un sous-titre change (`onPreview`) : le contour et les poignées le suivent. */
  measured: number
  openMenu(x: number, y: number, segmentId: string | null): void
  openLaneMenu(x: number, y: number, laneId: string): void
  closeMenu(): void
  stopEditing(): void
}

export const useCanvas = create<CanvasState>()((set) => ({
  editing: null,
  menu: null,
  measured: 0,
  openMenu: (x, y, segmentId) => set({ menu: { x, y, segmentId } }),
  openLaneMenu: (x, y, laneId) => set({ menu: { x, y, segmentId: null, laneId } }),
  closeMenu: () => set({ menu: null }),
  stopEditing: () => set({ editing: null })
}))

/** Commence à redimensionner ou rogner un morceau ; le curseur de lecture vient sur lui pour qu'on le voie. */
export function editFrame(segmentId: string, mode: FrameMode): void {
  const segment = useProject.getState().project.segments.find((s) => s.id === segmentId)
  if (!segment) return
  const time = player.time()
  if (time < segment.start || time >= segment.start + segment.duration) player.seek(segment.start + Math.min(0.05, segment.duration / 2))
  player.pause()
  useCanvas.setState({ editing: { segmentId, mode } })
}

let gesture = 0

/** À appeler au début de chaque glissé : tout le glissé sera une seule étape d'annulation, distincte des autres. */
export function beginFrameGesture(): void {
  gesture++
}

function updateSegment(segmentId: string, change: (transform: Transform, crop: Crop) => { transform?: Transform; crop?: Crop }): void {
  useProject.getState().update((draft) => {
    const segment = draft.segments.find((s) => s.id === segmentId)
    if (!segment) return
    const next = change(segment.transform ?? NO_TRANSFORM, segment.crop ?? NO_CROP)
    if (next.transform) segment.transform = next.transform
    if (next.crop) segment.crop = next.crop
  }, `cadrage:${segmentId}:${gesture}`)
}

export function setTransform(segmentId: string, transform: Transform): void {
  updateSegment(segmentId, () => ({ transform: { ...transform, scale: Math.min(8, Math.max(0.05, transform.scale)) } }))
}

export function setCrop(segmentId: string, crop: Crop): void {
  const clamp = (value: number): number => Math.min(1 - MIN_VISIBLE, Math.max(0, value))
  updateSegment(segmentId, () => {
    const next = { left: clamp(crop.left), top: clamp(crop.top), right: clamp(crop.right), bottom: clamp(crop.bottom) }
    // Toujours garder un peu d'image sur chaque axe.
    if (next.left + next.right > 1 - MIN_VISIBLE) next.right = 1 - MIN_VISIBLE - next.left
    if (next.top + next.bottom > 1 - MIN_VISIBLE) next.bottom = 1 - MIN_VISIBLE - next.top
    return { crop: next }
  })
}

/** Donne à tous les sous-titres de sa piste la place et la taille de celui-ci. */
export function applyFrameToAllCaptions(segmentId: string): void {
  useProject.getState().update((draft) => {
    const source = draft.segments.find((s) => s.id === segmentId)
    if (!source) return
    const transform = source.transform
    for (const segment of draft.segments) {
      if (!segment.caption || segment.laneId !== source.laneId || segment.id === segmentId) continue
      if (transform) segment.transform = { ...transform }
      else delete segment.transform
    }
  })
}

/** Vrai quand tous les sous-titres de sa piste ont déjà la place et la taille de celui-ci. */
export function captionsShareFrame(project: Project, segmentId: string): boolean {
  const source = project.segments.find((s) => s.id === segmentId)
  const t = source?.transform ?? NO_TRANSFORM
  return project.segments.every((s) => {
    if (!s.caption || s.laneId !== source?.laneId) return true
    const u = s.transform ?? NO_TRANSFORM
    return u.x === t.x && u.y === t.y && u.scale === t.scale
  })
}

export function resetFrame(segmentId: string): void {
  useProject.getState().update((draft) => {
    const segment = draft.segments.find((s) => s.id === segmentId)
    if (!segment) return
    delete segment.transform
    delete segment.crop
  })
}
