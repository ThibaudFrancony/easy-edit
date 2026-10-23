import { create } from 'zustand'

export const MIN_ZOOM = 4
export const MAX_ZOOM = 400
/** Marge à gauche du contenu de la timeline : là où se trouve t = 0. */
export const LEADING_INSET = 12

interface ScrollRequest {
  left: number
  smooth: boolean
}

interface TimelineState {
  /** Zoom : largeur d'une seconde, en px. */
  pixelsPerSecond: number
  scrollLeft: number
  viewportWidth: number
  /** Demande de défilement, appliquée par la vue de la timeline. */
  scrollRequest: ScrollRequest | null
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
  setViewport: (scrollLeft, viewportWidth) => set({ scrollLeft, viewportWidth }),
  zoomTo: (target, anchorTime) => {
    const { pixelsPerSecond, scrollLeft } = get()
    const pps = clampZoom(target)
    const anchorOnScreen = LEADING_INSET + anchorTime * pixelsPerSecond - scrollLeft
    const left = Math.max(0, LEADING_INSET + anchorTime * pps - anchorOnScreen)
    set({ pixelsPerSecond: pps, scrollLeft: left, scrollRequest: { left, smooth: false } })
  },
  zoomToFit: (duration) => {
    const pps = clampZoom((get().viewportWidth - LEADING_INSET * 2) / Math.max(duration, 5))
    set({ pixelsPerSecond: pps, scrollLeft: 0, scrollRequest: { left: 0, smooth: false } })
  },
  scrollTo: (left, smooth = false) => {
    if (get().scrollRequest) return
    set({ scrollRequest: { left: Math.max(0, left), smooth } })
  }
}))

export function timeToX(time: number, pixelsPerSecond: number): number {
  return LEADING_INSET + time * pixelsPerSecond
}

export function xToTime(x: number, pixelsPerSecond: number): number {
  return Math.max(0, (x - LEADING_INSET) / pixelsPerSecond)
}
