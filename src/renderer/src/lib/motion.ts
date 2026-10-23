import type { Transition } from 'motion/react'

// Toutes les animations de l'app. Rien n'apparaît ni ne disparaît sans passer par ici.

/** Sélection, survol, boutons. */
export const quick: Transition = { type: 'spring', duration: 0.22, bounce: 0.1 }
/** Panneaux, apparitions, changements de vue. */
export const standard: Transition = { type: 'spring', duration: 0.38, bounce: 0.15 }
/** Images et contenus qui finissent de charger. */
export const fade: Transition = { duration: 0.25, ease: 'easeOut' }

/** Apparition d'un élément dans une liste ou sur la timeline. */
export const rise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97 }
}
