import * as React from 'react'

interface RulerProps {
  /** Zoom : largeur d'une seconde, en px CSS. */
  pixelsPerSecond: number
  /** Défilement horizontal du contenu de la timeline (scrollLeft). */
  scrollLeft: number
  /** Marge à gauche du contenu : position x de t = 0 quand scrollLeft vaut 0. */
  leadingInset: number
  /** Appelé au clic et pendant le glissé, avec le temps sous le pointeur (jamais négatif). */
  onScrub(time: number): void
}

const HEIGHT = 22
const MIN_MAJOR_PX = 70
const MAJOR_INTERVALS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
// Un label s'étend à droite de son tick : on garde les ticks légèrement sortis à gauche pour qu'il reste visible.
const LABEL_OVERSCAN = 48

const COLOR_HAIRLINE = '#1F2229'
const COLOR_MAJOR = '#3A3E47'
const COLOR_MINOR = '#262A32'
const COLOR_LABEL = '#6B717C'
const LABEL_FONT = '500 10px "JetBrains Mono", monospace'

interface TickScale {
  major: number
  subdivisions: number
  decimals: number
}

function pickScale(pixelsPerSecond: number): TickScale {
  const major =
    MAJOR_INTERVALS.find((interval) => interval * pixelsPerSecond >= MIN_MAJOR_PX) ??
    MAJOR_INTERVALS[MAJOR_INTERVALS.length - 1]
  return {
    major,
    subdivisions: major === 15 ? 3 : 5,
    decimals: major < 1 ? (major === 0.25 ? 2 : 1) : 0,
  }
}

function formatTime(index: number, interval: number, decimals: number): string {
  // Arrondi en unités entières : évite les "0:00.9999" dus aux flottants.
  const scale = 10 ** decimals
  const units = Math.round(index * interval * scale)
  const totalSeconds = Math.floor(units / scale)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const fraction = decimals > 0 ? `.${String(units % scale).padStart(decimals, '0')}` : ''
  return `${minutes}:${seconds}${fraction}`
}

function draw(canvas: HTMLCanvasElement, width: number, props: Omit<RulerProps, 'onScrub'>): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { pixelsPerSecond, scrollLeft, leadingInset } = props
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(HEIGHT * dpr)
  // Redimensionner le canvas réinitialise la transform : à refaire à chaque dessin.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, HEIGHT)

  ctx.fillStyle = COLOR_HAIRLINE
  ctx.fillRect(0, HEIGHT - 1, width, 1)

  if (!(pixelsPerSecond > 0) || width <= 0) return

  const { major, subdivisions, decimals } = pickScale(pixelsPerSecond)
  const minor = major / subdivisions
  const xOf = (t: number): number => leadingInset + t * pixelsPerSecond - scrollLeft
  // Temps affichés aux bords gauche et droit du canvas.
  const tLeft = (scrollLeft - leadingInset) / pixelsPerSecond
  const tRight = (scrollLeft - leadingInset + width) / pixelsPerSecond

  // Index entiers : pas d'accumulation de flottants sur la boucle.
  ctx.fillStyle = COLOR_MINOR
  const firstMinor = Math.max(0, Math.floor(tLeft / minor))
  const lastMinor = Math.ceil(tRight / minor)
  for (let k = firstMinor; k <= lastMinor; k++) {
    if (k % subdivisions === 0) continue // graduation majeure, dessinée ci-dessous
    const x = xOf(k * minor)
    if (x < 0 || x > width) continue
    ctx.fillRect(Math.round(x), HEIGHT - 4, 1, 4)
  }

  ctx.font = LABEL_FONT
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const firstMajor = Math.max(0, Math.floor((tLeft - LABEL_OVERSCAN / pixelsPerSecond) / major))
  const lastMajor = Math.ceil(tRight / major)
  for (let i = firstMajor; i <= lastMajor; i++) {
    const x = xOf(i * major)
    if (x > width) break
    if (x < -LABEL_OVERSCAN) continue
    if (x >= 0) {
      ctx.fillStyle = COLOR_MAJOR
      ctx.fillRect(Math.round(x), HEIGHT - 7, 1, 7)
    }
    ctx.fillStyle = COLOR_LABEL
    ctx.fillText(formatTime(i, major, decimals), x + 4, HEIGHT / 2 - 2)
  }
}

export function Ruler({ pixelsPerSecond, scrollLeft, leadingInset, onScrub }: RulerProps): React.JSX.Element {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // Layout effect : le dessin suit le scroll dans la même frame, sans décalage visible.
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (canvas) draw(canvas, width, { pixelsPerSecond, scrollLeft, leadingInset })
  }, [width, pixelsPerSecond, scrollLeft, leadingInset])

  const timeAt = (canvas: HTMLCanvasElement, clientX: number): number => {
    const x = clientX - canvas.getBoundingClientRect().left
    return Math.max(0, (x + scrollLeft - leadingInset) / pixelsPerSecond)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    onScrub(timeAt(e.currentTarget, e.clientX))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    onScrub(timeAt(e.currentTarget, e.clientX))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', height: HEIGHT }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        // touch-action none : le scroll tactile ne doit pas voler le glissé.
        style={{ display: 'block', width: '100%', height: HEIGHT, cursor: 'pointer', touchAction: 'none' }}
      />
    </div>
  )
}
