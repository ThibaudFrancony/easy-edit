import { open, type FileHandle } from 'node:fs/promises'

export interface Mp4Track {
  trackId: number
  kind: 'video' | 'audio' | 'other'
  enabled: boolean
  name: string | null
}

/** Pistes du fichier, dans l'ordre des `trak` du `moov` (le même ordre que les flux FFmpeg). */
export async function readMp4Tracks(path: string): Promise<Mp4Track[]> {
  let fh: FileHandle | undefined
  try {
    fh = await open(path, 'r')
    const { size } = await fh.stat()
    const moov = await findMoov(fh, size)
    if (!moov) return []
    return parseBoxes(moov, 0, moov.length)
      .filter((box) => box.type === 'trak')
      .map((trak) => parseTrack(moov, trak))
  } catch {
    return []
  } finally {
    await fh?.close().catch(() => undefined)
  }
}

interface Box {
  type: string
  /** Début du contenu (après l'en-tête). */
  start: number
  /** Fin exclusive de la boîte. */
  end: number
}

// Le moov fait quelques Ko à quelques Mo ; la limite protège seulement d'un fichier corrompu.
const MAX_MOOV_BYTES = 128 * 1024 * 1024

/** Lit uniquement les en-têtes de premier niveau, jusqu'au moov (au début ou à la fin du fichier). */
async function findMoov(fh: FileHandle, fileSize: number): Promise<Buffer | null> {
  const head = Buffer.alloc(16)
  let pos = 0
  while (pos + 8 <= fileSize) {
    const { bytesRead } = await fh.read(head, 0, 16, pos)
    if (bytesRead < 8) return null
    let size = head.readUInt32BE(0)
    const type = head.toString('latin1', 4, 8)
    let header = 8
    if (size === 1) {
      if (bytesRead < 16) return null
      size = Number(head.readBigUInt64BE(8))
      header = 16
    } else if (size === 0) {
      size = fileSize - pos
    }
    if (size < header) return null
    if (type === 'moov') {
      const length = size - header
      if (length > MAX_MOOV_BYTES) return null
      const buf = Buffer.alloc(length)
      const read = await fh.read(buf, 0, length, pos + header)
      return read.bytesRead === length ? buf : null
    }
    pos += size
  }
  return null
}

/** Liste les boîtes enfants contenues dans [from, to). */
function parseBoxes(buf: Buffer, from: number, to: number): Box[] {
  const boxes: Box[] = []
  let p = from
  while (p + 8 <= to) {
    let size = buf.readUInt32BE(p)
    const type = buf.toString('latin1', p + 4, p + 8)
    let header = 8
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8))
      header = 16
    } else if (size === 0) {
      size = to - p
    }
    if (size < header || p + size > to) break
    boxes.push({ type, start: p + header, end: p + size })
    p += size
  }
  return boxes
}

function findBox(buf: Buffer, container: Box, ...types: string[]): Box | undefined {
  const children = parseBoxes(buf, container.start, container.end)
  for (const type of types) {
    const found = children.find((box) => box.type === type)
    if (found) return found
  }
  return undefined
}

function parseTrack(buf: Buffer, trak: Box): Mp4Track {
  const tkhd = findBox(buf, trak, 'tkhd')
  const mdia = findBox(buf, trak, 'mdia')
  if (!tkhd || !mdia) throw new Error('trak incomplet')

  // tkhd : version/flags (4 o), puis dates v0 = 2 x 4 o, v1 = 2 x 8 o, puis trackID.
  const version = buf[tkhd.start]
  const flags = buf.readUIntBE(tkhd.start + 1, 3)
  const trackIdOffset = tkhd.start + (version === 1 ? 20 : 12)
  if (trackIdOffset + 4 > tkhd.end) throw new Error('tkhd trop court')
  const trackId = buf.readUInt32BE(trackIdOffset)

  // hdlr : version/flags (4 o), pre_defined (4 o), puis handler_type.
  const hdlr = findBox(buf, mdia, 'hdlr')
  if (!hdlr || hdlr.start + 12 > hdlr.end) throw new Error('hdlr absent')
  const handler = buf.toString('latin1', hdlr.start + 8, hdlr.start + 12)
  const kind = handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : 'other'

  const udta = findBox(buf, trak, 'udta')
  const nameBox = udta ? findBox(buf, udta, 'name', 'titl') : undefined

  return {
    trackId,
    kind,
    enabled: (flags & 0x1) !== 0,
    name: nameBox ? decodeName(buf.subarray(nameBox.start, nameBox.end)) : null,
  }
}

/**
 * Le nom peut avoir un en-tête : version/flags (4 o) puis code langue (2 o) pour `titl`,
 * ou longueur (2 o) puis langue (2 o). Le texte est terminé par NUL.
 */
function decodeName(payload: Buffer): string | null {
  let start = 0
  if (payload.length >= 6 && payload.readUInt32BE(0) === 0) start = 6
  else if (payload.length >= 4 && payload.readUInt16BE(0) === payload.length - 4) start = 4
  const text = payload.subarray(start).toString('utf8').split('\0')[0] ?? ''
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return clean === '' ? null : clean
}
