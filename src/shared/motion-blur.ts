import type { MotionBlur } from './types'

// Flou de mouvement par interpolation puis mélange : entre deux vraies images, RIFE calcule des images
// intermédiaires ; chaque image floutée est la moyenne de celles qui tombent pendant que l'« obturateur » est ouvert,
// centré sur l'instant de l'image. Ce qui ne bouge pas (le HUD d'un jeu) reste net.

export const DEFAULT_MOTION_BLUR: MotionBlur = { enabled: true, amount: 0.5, quality: 8, weighting: 'equal', fps: 60 }

/** Cadence des clips décodés pour le flou, celle de l'export. */
export const BLUR_SOURCE_FPS = 60

export interface BlurSample {
  /** Décalage par rapport à l'image floutée, en images source (−0,25 : un quart d'image avant). */
  offset: number
  weight: number
}

/**
 * Les échantillons qui composent une image floutée : des multiples de 1/qualité dans la fenêtre d'obturation,
 * avec leurs poids (de somme 1). Un décalage entier est une vraie image et ne coûte rien.
 */
export function blurSamples(settings: MotionBlur): BlurSample[] {
  const spacing = BLUR_SOURCE_FPS / settings.fps
  const half = (settings.amount * spacing) / 2
  const reach = Math.floor(half * settings.quality + 1e-6)
  const sigma = half / 2
  const samples: BlurSample[] = []
  for (let k = -reach; k <= reach; k++) {
    const offset = k / settings.quality
    const weight = settings.weighting === 'gaussian' && sigma > 0 ? Math.exp(-0.5 * (offset / sigma) ** 2) : 1
    samples.push({ offset, weight })
  }
  const total = samples.reduce((sum, s) => sum + s.weight, 0)
  return samples.map((s) => ({ offset: s.offset, weight: s.weight / total }))
}

/** Le flou change-t-il l'image ? (Coupé, ou intensité nulle : un seul échantillon, l'image elle-même.) */
export const blurIsActive = (settings: MotionBlur | undefined): settings is MotionBlur =>
  settings !== undefined && settings.enabled && blurSamples(settings).length > 1
