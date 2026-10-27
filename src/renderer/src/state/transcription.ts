import { create } from 'zustand'
import { DEFAULT_LOOK, type TimedWord, groupWords } from '@shared/captions'
import { captionLane, placeCaptions, segmentsIn } from '@shared/project'
import { player } from '@/engine/player'
import { type TranscribePhase, transcribe } from '@/engine/transcribe'
import { useProject } from './project'
import { useTimeline } from './timeline'

/** Type de glisser-déposer du bouton « Transcrire » vers une piste. */
export const TRANSCRIBE_DRAG_TYPE = 'application/x-easyedit-transcribe'

interface TranscriptionState {
  running: boolean
  /** Ce qu'on fait en ce moment (« Micro », téléchargement du modèle…). */
  phase: TranscribePhase | null
  lane: string | null
  fraction: number | null
  error: string | null
  /** « Quelle piste transcrire ? » est ouvert (par le bouton ou par le menu Plugins). */
  picking: boolean
}

export const useTranscription = create<TranscriptionState>()(() => ({
  running: false,
  phase: null,
  lane: null,
  fraction: null,
  error: null,
  picking: false
}))

/** On peut transcrire s'il y a une piste audio et qu'aucune transcription n'est en cours. */
export const canTranscribe = (): boolean =>
  !useTranscription.getState().running && useProject.getState().project.lanes.some((l) => l.kind === 'audio')

/** Ouvre ou ferme « Quelle piste transcrire ? ». */
export function setPicking(picking: boolean): void {
  useTranscription.setState({ picking: picking && canTranscribe() })
}

/**
 * Transcrit des pistes audio et pose leurs sous-titres sur une piste « Sous-titres · <piste> », tout en haut.
 * Chaque morceau est transcrit séparément ; un nouveau passage remplace les anciens sous-titres au même endroit.
 */
export async function transcribeLanes(laneIds: string[]): Promise<void> {
  if (useTranscription.getState().running) return
  useTranscription.setState({ running: true, error: null, fraction: null })
  try {
    for (const laneId of laneIds) {
      const project = useProject.getState().project
      const lane = project.lanes.find((l) => l.id === laneId && l.kind === 'audio')
      if (!lane) continue
      useTranscription.setState({ lane: lane.name })
      const words: TimedWord[] = []
      for (const segment of segmentsIn(project, laneId)) {
        const buffer = await player.audioBuffer(segment.source, segment.stream)
        if (!buffer) continue
        const samples = monoSlice(buffer, segment.sourceStart, segment.duration)
        const found = await transcribe(samples, buffer.sampleRate, (phase, fraction) => useTranscription.setState({ phase, fraction }))
        for (const word of found) {
          if (word.start >= segment.duration) continue
          words.push({ text: word.text, start: segment.start + word.start, end: segment.start + Math.min(word.end, segment.duration) })
        }
      }
      const drafts = groupWords(words)
      if (drafts.length === 0) continue
      let captionLaneId = ''
      useProject.getState().update((draft) => {
        captionLaneId = captionLane(draft, `Sous-titres · ${lane.name}`, DEFAULT_LOOK)
        placeCaptions(draft, captionLaneId, drafts)
      })
      useTimeline.getState().inspect(captionLaneId)
    }
  } catch (error) {
    useTranscription.setState({ error: (error as Error).message })
  } finally {
    useTranscription.setState({ running: false, phase: null, lane: null, fraction: null })
  }
}

/** La partie utilisée d'un son, mélangée en mono. */
function monoSlice(buffer: AudioBuffer, start: number, duration: number): Float32Array {
  const from = Math.max(0, Math.floor(start * buffer.sampleRate))
  const to = Math.min(buffer.length, Math.ceil((start + duration) * buffer.sampleRate))
  const out = new Float32Array(Math.max(0, to - from))
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < out.length; i++) out[i]! += data[from + i]! / buffer.numberOfChannels
  }
  return out
}
