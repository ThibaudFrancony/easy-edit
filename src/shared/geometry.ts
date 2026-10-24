import type { Crop, Segment, Transform } from './types'

// Où s'affiche un morceau dans l'image finale. Tout est en fractions de l'image (0 à 1), pour servir
// à l'aperçu (en % CSS) comme à l'export (en pixels).

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const NO_TRANSFORM: Transform = { x: 0, y: 0, scale: 1 }
export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 }
/** Part minimale de l'image qu'un rognage doit garder, sur chaque axe. */
export const MIN_VISIBLE = 0.05

/**
 * `full` : le média entier, ajusté dans l'image (sans déformation), agrandi par `scale` autour de son centre et
 * décalé de `x`, `y`. `visible` : la partie qui reste après le rognage.
 */
export function placement(mediaAspect: number, frameAspect: number, segment: Pick<Segment, 'transform' | 'crop'>): { full: Rect; visible: Rect } {
  const { x, y, scale } = segment.transform ?? NO_TRANSFORM
  const crop = segment.crop ?? NO_CROP
  const fitWidth = Math.min(1, mediaAspect / frameAspect)
  const fitHeight = Math.min(1, frameAspect / mediaAspect)
  const width = fitWidth * scale
  const height = fitHeight * scale
  const full = { x: 0.5 + x - width / 2, y: 0.5 + y - height / 2, width, height }
  const visible = {
    x: full.x + crop.left * width,
    y: full.y + crop.top * height,
    width: width * (1 - crop.left - crop.right),
    height: height * (1 - crop.top - crop.bottom)
  }
  return { full, visible }
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

export function isTransformed(segment: Pick<Segment, 'transform' | 'crop'>): boolean {
  const t = segment.transform ?? NO_TRANSFORM
  const c = segment.crop ?? NO_CROP
  return t.x !== 0 || t.y !== 0 || t.scale !== 1 || c.left !== 0 || c.top !== 0 || c.right !== 0 || c.bottom !== 0
}
