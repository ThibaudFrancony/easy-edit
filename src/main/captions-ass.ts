import { captionStyle, DEFAULT_LOOK, visibleWords } from '@shared/captions'
import type { CaptionStyle, CaptionStyleId } from '@shared/captions'
import { segmentsIn } from '@shared/project'
import type { Lane, Project, Segment } from '@shared/types'

// Sous-titres pour libass (filtre `ass` de FFmpeg). Le rendu suit l'aperçu : mêmes styles, mêmes mots affichés
// à chaque instant (`visibleWords`), mêmes couleurs.

// Inter embarquée (resources/fonts). Le poids 700 passe par la famille « Inter », seule à porter le Bold.
const FONT_BY_WEIGHT: Record<CaptionStyle['weight'], { family: string; bold: boolean }> = {
  500: { family: 'Inter Medium', bold: false },
  600: { family: 'Inter SemiBold', bold: false },
  700: { family: 'Inter', bold: true },
  800: { family: 'Inter ExtraBold', bold: false }
}

// Ascendant + descendant d'Inter font environ 1,21 em : la boîte de ligne s'étend de 0,605 em de part et d'autre du centre.
const LINE_HALF_HEIGHT = 0.605
const SIDE_MARGIN = 0.07
const OUTLINE = { colour: '#000000', opacity: 0.7 }
const BOX = { colour: '#0B0C0F', opacity: 0.78 }
// Bandeau : 0,4 em de chaque côté en CSS. Le contour de libass donne la marge verticale (0,15 em) ; une espace
// insécable de chaque côté complète la marge horizontale.
const BOX_PADDING_Y = 0.15
const BOX_SPACE = '\\h'

interface Dialogue {
  layer: number
  start: number
  end: number
  style: CaptionStyleId
  text: string
}

/** Couleur ASS `&HAABBGGRR` ; l'alpha est inversé (0 : opaque, 255 : transparent). */
function assColour(hex: string, opacity = 1): string {
  const rgb = hex.slice(1).toUpperCase()
  const alpha = Math.round((1 - opacity) * 255).toString(16).toUpperCase().padStart(2, '0')
  return `&H${alpha}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`
}

/** Couleur sans alpha, pour la balise de remplacement `{\c…}`. */
const assTag = (hex: string): string => assColour(hex).replace(/^&H../, '&H') + '&'

function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100))
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`
}

/** ASS ne permet pas d'échapper `{`, `}` ni `\` dans le texte : on les remplace par des signes voisins. */
function escapeText(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\\/g, '/').replace(/\s+/g, ' ')
}

function styleLine(style: CaptionStyle, width: number, height: number): string {
  const fontsize = Math.round(style.size * height)
  const font = FONT_BY_WEIGHT[style.weight]
  const marginV = Math.max(0, Math.round(height - style.y * height - LINE_HALF_HEIGHT * fontsize))
  const marginSide = Math.round(SIDE_MARGIN * width)
  // Avec BorderStyle 3, libass peint la boîte dans OutlineColour (BackColour ne sert qu'à l'ombre).
  const outline = style.box ? BOX_PADDING_Y * fontsize : style.outline * fontsize
  const colour = style.box ? assColour(BOX.colour, BOX.opacity) : assColour(OUTLINE.colour, OUTLINE.opacity)
  return [
    style.id,
    font.family,
    fontsize,
    assColour('#FFFFFF'),
    assColour('#FFFFFF'),
    colour,
    assColour('#000000'),
    font.bold ? -1 : 0,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    style.box ? 3 : 1,
    Number(outline.toFixed(2)),
    0,
    2,
    marginSide,
    marginSide,
    marginV,
    1
  ].join(',')
}

/** Les lignes de dialogue d'un sous-titre : une par tranche de temps où les mots affichés ne changent pas. */
function dialoguesFor(segment: Segment, lane: Lane, style: CaptionStyle): Dialogue[] {
  const words = segment.caption?.words ?? []
  const look = lane.look ?? DEFAULT_LOOK
  const cuts = new Set<number>([0, segment.duration])
  for (const word of words) {
    cuts.add(Math.min(Math.max(word.start, 0), segment.duration))
    cuts.add(Math.min(Math.max(word.end, 0), segment.duration))
  }
  const times = [...cuts].sort((a, b) => a - b)
  const dialogues: Dialogue[] = []
  for (let i = 0; i + 1 < times.length; i++) {
    const from = times[i]!
    const to = times[i + 1]!
    if (Math.round(to * 100) <= Math.round(from * 100)) continue
    const shown = visibleWords(words, style.wordsShown, (from + to) / 2)
    if (shown.words.length === 0) continue
    const plain = shown.words.map((word) => escapeText(style.uppercase ? word.text.toUpperCase() : word.text)).join(' ')
    const coloured = shown.words
      .map((word, index) => {
        const txt = escapeText(style.uppercase ? word.text.toUpperCase() : word.text)
        return look.accent && index === shown.current ? `{\\c${assTag(look.accent)}}${txt}{\\c&HFFFFFF&}` : txt
      })
      .join(' ')
    const start = segment.start + from
    const end = segment.start + to
    if (!style.box) {
      dialogues.push({ layer: 0, start, end, style: style.id, text: coloured })
      continue
    }
    // Bandeau : libass peint une boîte par morceau de texte de même couleur, et les boîtes translucides se
    // superposent (zones plus sombres). On dessine donc la boîte seule (texte invisible) sous le texte seul
    // (boîte invisible), ce qui garde une boîte d'un seul tenant.
    dialogues.push({ layer: 0, start, end, style: style.id, text: `{\\1a&HFF&}${BOX_SPACE}${plain}${BOX_SPACE}` })
    dialogues.push({ layer: 1, start, end, style: style.id, text: `{\\3a&HFF&}${BOX_SPACE}${coloured}${BOX_SPACE}` })
  }
  return dialogues
}

/** Fichier ASS des sous-titres du montage, pour une image de `width` × `height` ; `null` s'il n'y en a aucun. */
export function buildCaptionsASS(project: Project, width: number, height: number): string | null {
  const dialogues: Dialogue[] = []
  const used = new Set<CaptionStyleId>()
  for (const lane of project.lanes) {
    if (lane.kind !== 'caption' || lane.muted) continue
    const look = lane.look ?? DEFAULT_LOOK
    const style = captionStyle(look.style)
    for (const segment of segmentsIn(project, lane.id)) {
      if (!segment.caption) continue
      used.add(style.id)
      dialogues.push(...dialoguesFor(segment, lane, style))
    }
  }
  if (used.size === 0) return null

  dialogues.sort((a, b) => a.start - b.start)
  const styles = [...used].map((id) => `Style: ${styleLine(captionStyle(id), width, height)}`)
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogues.map((d) => `Dialogue: ${d.layer},${assTime(d.start)},${assTime(d.end)},${d.style},,0,0,0,,${d.text}`),
    ''
  ].join('\n')
}
