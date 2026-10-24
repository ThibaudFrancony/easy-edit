import type { CaptionLook, CaptionWord } from './types'

// Sous-titres : styles proposés et découpage du texte. Partagé par l'aperçu (CSS) et l'export (ASS / libass),
// qui doivent donner le même rendu.

export type CaptionStyleId = 'classique' | 'bandeau' | 'impact' | 'mot'

export interface CaptionStyle {
  id: CaptionStyleId
  name: string
  /** Taille du texte en fraction de la hauteur de l'image. */
  size: number
  weight: 500 | 600 | 700 | 800
  uppercase: boolean
  /** Centre vertical du texte, en fraction de la hauteur de l'image. */
  y: number
  /** Contour sombre autour des lettres, en fraction de la taille du texte (0 : aucun). */
  outline: number
  /** Texte posé sur un bandeau sombre. */
  box: boolean
  /** Combien de mots à la fois : la phrase entière, ou un groupe autour du mot prononcé. */
  wordsShown: 'phrase' | 3 | 1
}

export const CAPTION_STYLES: CaptionStyle[] = [
  { id: 'classique', name: 'Classique', size: 0.052, weight: 600, uppercase: false, y: 0.86, outline: 0.11, box: false, wordsShown: 'phrase' },
  { id: 'bandeau', name: 'Bandeau', size: 0.045, weight: 500, uppercase: false, y: 0.88, outline: 0, box: true, wordsShown: 'phrase' },
  { id: 'impact', name: 'Impact', size: 0.078, weight: 800, uppercase: true, y: 0.72, outline: 0.16, box: false, wordsShown: 3 },
  { id: 'mot', name: 'Mot à mot', size: 0.09, weight: 700, uppercase: false, y: 0.66, outline: 0.12, box: false, wordsShown: 1 }
]

/** Couleurs proposées pour le mot prononcé ; `null` : pas d'accent, tout reste blanc. */
export const CAPTION_ACCENTS = ['#FF6B2C', '#FFD23F', '#3DDC97', '#4DA3FF', '#FF5C93']

export const DEFAULT_LOOK: CaptionLook = { style: 'classique', accent: '#FF6B2C' }

export function captionStyle(id: CaptionStyleId): CaptionStyle {
  return CAPTION_STYLES.find((s) => s.id === id) ?? CAPTION_STYLES[0]!
}

/** Mot absolu sur la timeline (en secondes), tel que le rend la transcription. */
export interface TimedWord {
  text: string
  start: number
  end: number
}

/** Un sous-titre : une phrase courte, avec ses mots en temps relatif au début du sous-titre. */
export interface CaptionDraft {
  start: number
  end: number
  words: CaptionWord[]
}

/**
 * Regroupe des mots en sous-titres lisibles : on coupe après une ponctuation forte, à une pause de plus de 0,6 s,
 * ou au-delà de 7 mots ou 42 caractères.
 */
export function groupWords(words: TimedWord[]): CaptionDraft[] {
  const drafts: CaptionDraft[] = []
  let current: TimedWord[] = []
  const flush = (): void => {
    const first = current[0]
    const last = current.at(-1)
    if (first && last) {
      drafts.push({
        start: first.start,
        end: last.end,
        words: current.map((w) => ({ text: w.text, start: w.start - first.start, end: w.end - first.start }))
      })
    }
    current = []
  }
  for (const word of words) {
    const previous = current.at(-1)
    const length = current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length
    if (previous && (word.start - previous.end > 0.6 || current.length >= 7 || length > 42)) flush()
    current.push(word)
    if (/[.!?…]$/.test(word.text)) flush()
  }
  flush()
  return drafts
}

/**
 * Ce qu'un style affiche à l'instant `time` (relatif au début du sous-titre) : les mots montrés et l'indice,
 * parmi eux, du mot prononcé (-1 entre deux mots).
 */
export function visibleWords(words: CaptionWord[], wordsShown: CaptionStyle['wordsShown'], time: number): { words: CaptionWord[]; current: number } {
  let index = words.findIndex((w) => time >= w.start && time < w.end)
  if (index === -1) {
    // Entre deux mots : on garde le dernier mot commencé, sans le surligner.
    const started = words.filter((w) => w.start <= time).length - 1
    if (wordsShown === 'phrase') return { words, current: -1 }
    index = Math.max(0, started)
    const group = wordsShown === 1 ? [index, index + 1] : [index - (index % 3), index - (index % 3) + 3]
    return { words: words.slice(group[0], group[1]), current: -1 }
  }
  if (wordsShown === 'phrase') return { words, current: index }
  if (wordsShown === 1) return { words: [words[index]!], current: 0 }
  const from = index - (index % 3)
  return { words: words.slice(from, from + 3), current: index - from }
}
