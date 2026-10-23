import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { MEDIA_SCHEME, fromMediaURL } from '@shared/media-url'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

// Une seule plage : `a-b`, `a-` ou `-n`. Les plages multiples ne matchent pas et sont servies en 200.
const RANGE_RE = /^bytes=(\d*)-(\d*)$/

type ByteRange = { start: number; end: number }

/** À appeler avant `app.whenReady()`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true },
    },
  ])
}

/** À appeler après `app.whenReady()`. */
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const path = fromMediaURL(request.url)
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) return new Response(null, { status: 404 })

      const size = info.size
      const baseHeaders = {
        'Accept-Ranges': 'bytes',
        // L'interface lit les pistes audio avec fetch() : il faut autoriser son origine (localhost en développement).
        'Access-Control-Allow-Origin': '*',
        'Content-Type': MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
      }
      const range = parseRange(request.headers.get('range'), size)

      if (range === 'unsatisfiable') {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      if (!range) {
        return new Response(streamFile(path), {
          status: 200,
          headers: { ...baseHeaders, 'Content-Length': String(size) },
        })
      }

      const { start, end } = range
      return new Response(streamFile(path, start, end), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1),
        },
      })
    } catch (error) {
      // Pas de throw : une exception dans le handler fait échouer la requête sans réponse exploitable.
      console.error('[media protocol]', error)
      return new Response(null, { status: 500 })
    }
  })
}

function parseRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null
  const match = RANGE_RE.exec(header.trim())
  if (!match) return null

  const [, startStr, endStr] = match
  if (!startStr && !endStr) return null

  let start: number
  let end: number
  if (!startStr) {
    // Suffixe : les `n` derniers octets.
    start = Math.max(0, size - Number(endStr))
    end = size - 1
  } else {
    start = Number(startStr)
    end = endStr ? Math.min(Number(endStr), size - 1) : size - 1
  }

  if (size === 0 || start >= size || end < start) return 'unsatisfiable'
  return { start, end }
}

function streamFile(path: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  // Flux Node converti : le fichier n'est jamais chargé entièrement en mémoire (vidéos volumineuses).
  return Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream<Uint8Array>
}
