// Génère l'icône de l'app à partir de resources/icon.svg : resources/icon.icns (app empaquetée)
// et resources/icon.png (Dock en développement). À relancer après avoir modifié le SVG : npm run icon
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const resources = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
const svg = readFileSync(join(resources, 'icon.svg'))
const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

// Tailles attendues par iconutil : chaque taille en 1x et 2x.
const iconset = join(mkdtempSync(join(tmpdir(), 'easy-edit-icon-')), 'icon.iconset')
execFileSync('mkdir', ['-p', iconset])
for (const size of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${size}x${size}.png`), render(size))
  writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), render(size * 2))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'icon.icns')])
writeFileSync(join(resources, 'icon.png'), render(1024))
rmSync(dirname(iconset), { recursive: true, force: true })
console.log('Icône générée : resources/icon.icns et resources/icon.png')
