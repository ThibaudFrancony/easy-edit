// Les fichiers locaux (clips, vignettes, pistes audio extraites) sont servis à l'interface par le protocole `media://`.

export const MEDIA_SCHEME = 'media'

export function toMediaURL(path: string): string {
  return `${MEDIA_SCHEME}://file/${encodeURIComponent(path)}`
}

export function fromMediaURL(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}
