import { create } from 'zustand'
import type { Lane, Project, Segment } from '@shared/types'
import { projectDuration } from '@shared/project'

// Lecture de la timeline. Le temps vient de l'horloge audio (AudioContext) : c'est la référence la plus stable.
// Le son passe par la Web Audio API (un gain par piste, jusqu'à 200 %) ; la vidéo est calée dessus par <Preview>.

interface PlaybackState {
  time: number
  /** 0 à l'arrêt, 1 en lecture normale, ±2, ±4, ±8 avec J et L. */
  rate: number
  duration: number
}

export const usePlayback = create<PlaybackState>()(() => ({ time: 0, rate: 0, duration: 0 }))

/** Image par image : les clips de ReplayClip tournent à environ 60 i/s. */
export const FRAME = 1 / 60

class Player {
  private context = new AudioContext({ latencyHint: 'interactive' })
  private laneGains = new Map<string, GainNode>()
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private sources: AudioBufferSourceNode[] = []
  private project: Project = { version: 1, lanes: [], segments: [] }
  private anchorTime = 0
  private anchorClock = 0
  private rate = 0
  private frame = 0

  /** Temps courant de la timeline, lu à chaque image par l'aperçu et le curseur. */
  time(): number {
    if (this.rate === 0) return this.anchorTime
    return this.clamp(this.anchorTime + (this.context.currentTime - this.anchorClock) * this.rate)
  }

  get playing(): boolean {
    return this.rate !== 0
  }

  get videoSegments(): Segment[] {
    const video = this.project.lanes.find((l) => l.kind === 'video')
    return video ? this.project.segments.filter((s) => s.laneId === video.id).sort((a, b) => a.start - b.start) : []
  }

  setProject(project: Project): void {
    const structureChanged = project.segments !== this.project.segments
    this.project = project
    usePlayback.setState({ duration: projectDuration(project) })
    for (const lane of project.lanes) this.applyGain(lane)
    for (const segment of this.audioSegments()) void this.buffer(segment)
    if (structureChanged && this.rate === 1) this.scheduleAudio()
    if (this.anchorTime > projectDuration(project)) this.seek(projectDuration(project))
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play(1)
  }

  play(rate: number): void {
    const duration = projectDuration(this.project)
    if (duration === 0) return
    const now = this.time()
    if (rate < 0 && now <= 0.01) return
    // Relancer depuis la fin repart du début.
    this.anchorTime = rate > 0 && now >= duration - 0.01 ? 0 : now
    this.anchorClock = this.context.currentTime
    this.rate = rate
    void this.context.resume()
    // Au-delà de la vitesse normale, le son est coupé plutôt que déformé.
    if (rate === 1) this.scheduleAudio()
    else this.stopAudio()
    usePlayback.setState({ rate, time: this.anchorTime })
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(this.tick)
  }

  pause(): void {
    this.anchorTime = this.time()
    this.rate = 0
    this.stopAudio()
    cancelAnimationFrame(this.frame)
    usePlayback.setState({ rate: 0, time: this.anchorTime })
  }

  seek(time: number): void {
    this.anchorTime = this.clamp(time)
    this.anchorClock = this.context.currentTime
    if (this.rate === 1) this.scheduleAudio()
    usePlayback.setState({ time: this.anchorTime })
  }

  step(frames: number): void {
    if (this.playing) this.pause()
    this.seek(Math.round((this.time() + frames * FRAME) / FRAME) * FRAME)
  }

  /** J, K, L : retour rapide, pause, avance rapide. Chaque appui de plus double la vitesse. */
  shuttle(direction: -1 | 0 | 1): void {
    if (direction === 0) return this.pause()
    const sameWay = Math.sign(this.rate) === direction
    const speed = sameWay ? Math.min(Math.abs(this.rate) * 2, 8) : 1
    this.play(direction * speed)
  }

  private tick = (): void => {
    const time = this.time()
    const duration = projectDuration(this.project)
    if ((this.rate > 0 && time >= duration) || (this.rate < 0 && time <= 0)) {
      this.anchorTime = this.rate > 0 ? duration : 0
      this.pause()
      return
    }
    usePlayback.setState({ time })
    this.frame = requestAnimationFrame(this.tick)
  }

  private clamp(time: number): number {
    return Math.min(Math.max(0, time), projectDuration(this.project))
  }

  private audioSegments(): Segment[] {
    const audioLanes = new Set(this.project.lanes.filter((l) => l.kind === 'audio').map((l) => l.id))
    return this.project.segments.filter((s) => audioLanes.has(s.laneId))
  }

  private applyGain(lane: Lane): void {
    if (lane.kind !== 'audio') return
    let gain = this.laneGains.get(lane.id)
    if (!gain) {
      gain = this.context.createGain()
      gain.connect(this.context.destination)
      this.laneGains.set(lane.id, gain)
    }
    // Petite rampe : un changement de volume ne fait jamais de « clic ».
    gain.gain.setTargetAtTime(lane.muted ? 0 : lane.volume, this.context.currentTime, 0.015)
  }

  /** Le son décodé d'une piste source, partagé entre la lecture et les formes d'onde. */
  audioBuffer(source: string, stream: number): Promise<AudioBuffer | null> {
    return this.buffer({ source, stream })
  }

  private buffer(segment: Pick<Segment, 'source' | 'stream'>): Promise<AudioBuffer | null> {
    const key = `${segment.source}|${segment.stream}`
    let pending = this.buffers.get(key)
    if (!pending) {
      pending = window.api
        .audioTrack(segment.source, segment.stream)
        .then((url) => fetch(url))
        .then((response) => response.arrayBuffer())
        .then((data) => this.context.decodeAudioData(data))
        .catch(() => {
          this.buffers.delete(key)
          return null
        })
      this.buffers.set(key, pending)
    }
    return pending
  }

  private scheduleAudio(): void {
    this.stopAudio()
    const from = this.time()
    for (const segment of this.audioSegments()) {
      if (segment.start + segment.duration <= from) continue
      void this.buffer(segment).then((buffer) => {
        const gain = this.laneGains.get(segment.laneId)
        if (!buffer || !gain || this.rate !== 1) return
        // Le décodage a pu prendre du temps : on recalcule où en est la lecture maintenant.
        const now = this.time()
        const end = segment.start + segment.duration
        if (end <= now) return
        const into = Math.max(0, now - segment.start)
        const source = this.context.createBufferSource()
        source.buffer = buffer
        source.connect(gain)
        source.start(this.context.currentTime + Math.max(0, segment.start - now), segment.sourceStart + into, segment.duration - into)
        source.onended = () => (this.sources = this.sources.filter((s) => s !== source))
        this.sources.push(source)
      })
    }
  }

  private stopAudio(): void {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // Déjà arrêtée.
      }
    }
    this.sources = []
  }
}

export const player = new Player()
