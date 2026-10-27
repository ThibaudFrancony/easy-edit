// Processus utilitaire de transcription (lancé par transcription.ts) : le modèle Voz y tourne sur le CPU avec
// onnxruntime-node, loin de l'interface et du processus principal, que sa préparation bloquerait plusieurs secondes.
import { Voz } from '@desert-ant-labs/voz'
import * as ort from 'onnxruntime-node'
import type { TranscriberIn, TranscriberOut } from './transcriber-messages'

let loading: Promise<Voz> | null = null

const post = (message: TranscriberOut): void => process.parentPort.postMessage(message)

/** Chargé une fois (téléchargé la première fois, puis lu depuis le cache de l’utilisateur). */
function model(id: number): Promise<Voz> {
  if (!loading) {
    post({ id, kind: 'progress', phase: 'download', fraction: null })
    loading = Voz.load({ ort })
    loading.catch(() => (loading = null))
  }
  return loading
}

process.parentPort.on('message', async (event) => {
  const { id, samples } = event.data as TranscriberIn
  try {
    const voz = await model(id)
    post({ id, kind: 'progress', phase: 'transcribe', fraction: 0 })
    // Un Float32Array est lu comme du mono à 16 kHz : l'interface l'a déjà rééchantillonné proprement.
    const result = await voz.transcribe(samples, {
      onProgress: (fraction: number) => post({ id, kind: 'progress', phase: 'transcribe', fraction })
    })
    post({ id, kind: 'done', words: result.words.map((w) => ({ text: w.text, start: w.start, end: w.end })) })
  } catch (error) {
    post({ id, kind: 'error', message: error instanceof Error ? error.message : String(error) })
  }
})
