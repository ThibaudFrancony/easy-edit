/** Minutes, secondes et centièmes : « 1:12.40 ». */
export function timecode(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds) * 100)
  const minutes = Math.floor(total / 6000)
  const secs = Math.floor(total / 100) % 60
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`
}

/** Durée courte d'un clip : « 0:31 ». */
export function shortDuration(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Heure d'un clip, d'après sa date de création : « 23:17 ». */
export function clipTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function fileName(path: string): string {
  return path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? path
}
