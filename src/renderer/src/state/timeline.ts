import { create } from 'zustand'

export const MIN_ZOOM = 4
export const MAX_ZOOM = 400
/** Marge à gauche du contenu de la timeline : là où se trouve t = 0. */
export const LEADING_INSET = 12

interface ScrollRequest {
  left: number
  smooth: boolean
}

/** Morceaux en train d'être déplacés à la souris : ils sont affichés décalés de `delta` jusqu'au lâcher. */
export interface DragState {
  ids: Set<string>
  delta: number
  snapAt: number | null
}

/** Bord d'un morceau en train d'être tiré à la souris : affiché décalé de `delta` jusqu'au lâcher. */
export interface TrimState {
  id: string
  edge: 'start' | 'end'
  delta: number
  snapAt: number | null
  /** Durée de la source (l'infini pour une image) : on ne peut pas allonger un clip au-delà. */
  sourceDuration: number
}

interface TimelineState {
  /** Zoom : largeur d'une seconde, en px. */
  pixelsPerSecond: number
  scrollLeft: number
  viewportWidth: number
  /** Demande de défilement, appliquée par la vue de la timeline. */
  scrollRequest: ScrollRequest | null
  selection: Set<string>
  drag: DragState | null
  trim: TrimState | null
  /** La piste dont les réglages sont ouverts dans l'inspecteur. */
  inspectedLane: string | null
  setSelection(selection: Set<string>): void
  inspect(laneId: string | null): void
  setDrag(drag: DragState | null): void
  setTrim(trim: TrimState | null): void
  setViewport(scrollLeft: number, viewportWidth: number): void
  /** Change le zoom en gardant `anchorTime` au même endroit à l'écran. */
  zoomTo(pixelsPerSecond: number, anchorTime: number): void
  /** Zoom qui fait tenir toute la timeline dans la largeur visible. */
  zoomToFit(duration: number): void
  scrollTo(scrollLeft: number, smooth?: boolean): void
}

const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

export const useTimeline = create<TimelineState>()((set, get) => ({
  pixelsPerSecond: 24,
  scrollLeft: 0,
  viewportWidth: 1000,
  scrollRequest: null,
  selection: new Set(),
  drag: null,
  trim: null,
  inspectedLane: null,
  setSelection: (selection) => set({ selection }),
  inspect: (inspectedLane) => set({ inspectedLane }),
  setDrag: (drag) => set({ drag }),
  setTrim: (trim) => set({ trim }),
  setViewport: (scrollLeft, viewportWidth) => set({ scrollLeft, viewportWidth }),
  zoomTo: (target, anchorTime) => {
    instantLayout()
    const { pixelsPerSecond, scrollLeft } = get()
    const pps = clampZoom(target)
    const anchorOnScreen = LEADING_INSET + anchorTime * pixelsPerSecond - scrollLeft
    const left = Math.max(0, LEADING_INSET + anchorTime * pps - anchorOnScreen)
    set({ pixelsPerSecond: pps, scrollLeft: left, scrollRequest: { left, smooth: false } })
  },
  zoomToFit: (duration) => {
    instantLayout()
    const pps = clampZoom((get().viewportWidth - LEADING_INSET * 2) / Math.max(duration, 5))
    set({ pixelsPerSecond: pps, scrollLeft: 0, scrollRequest: { left: 0, smooth: false } })
  },
  scrollTo: (left, smooth = false) => {
    if (get().scrollRequest) return
    set({ scrollRequest: { left: Math.max(0, left), smooth } })
  }
}))

let instantUntil = 0

/**
 * Les morceaux glissent en douceur quand ils changent de place (coupe, suppression, annulation)…
 * sauf juste après un zoom ou un lâcher de souris, où ils doivent suivre sans retard : on le signale ici.
 */
export function instantLayout(): void {
  instantUntil = performance.now() + 80
}

export function isInstantLayout(): boolean {
  return performance.now() < instantUntil
}

export function timeToX(time: number, pixelsPerSecond: number): number {
  return LEADING_INSET + time * pixelsPerSecond
}

export function xToTime(x: number, pixelsPerSecond: number): number {
  return Math.max(0, (x - LEADING_INSET) / pixelsPerSecond)
}
