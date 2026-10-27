import { create } from 'zustand'
import type { ExportQuality, ExportStep } from '@shared/types'
import { fileName } from '@/lib/format'
import { useProject } from './project'

type Status = 'idle' | 'running' | 'done' | 'error'

const REMOTE_KEY = 'easy-edit.export.remote'

/** Rendu sur le PC de la maison : le dernier choix, sur le PC par défaut. */
function rememberedRemote(): boolean {
  try {
    return localStorage.getItem(REMOTE_KEY) !== 'false'
  } catch {
    return true
  }
}

interface ExportState {
  open: boolean
  status: Status
  fraction: number
  /** Ce que l'export calcule en ce moment : le motion blur des pistes qui en ont, puis la vidéo finale. */
  step: ExportStep
  /** Le fichier produit, une fois l'export terminé. */
  output: string | null
  error: string | null
  name: string
  folder: string
  quality: ExportQuality
  /** Nom du PC de rendu quand il répond (« PC Linux »), sinon null. */
  renderServer: string | null
  /** Rendu sur le PC de rendu (s'il répond) plutôt que sur cet ordinateur. */
  remote: boolean
  /** Le PC de rendu attend son code d'appairage. */
  needsCode: boolean
  show(): Promise<void>
  hide(): void
  setName(name: string): void
  setFolder(folder: string): void
  setQuality(quality: ExportQuality): void
  setRemote(remote: boolean): void
  /** Envoie le code d'appairage, puis relance l'export s'il est bon. */
  submitCode(code: string): Promise<void>
  start(): void
  cancel(): void
}

export const useExport = create<ExportState>()((set, get) => ({
  open: false,
  status: 'idle',
  fraction: 0,
  step: 'encode',
  output: null,
  error: null,
  name: '',
  folder: '',
  quality: 'source',
  renderServer: null,
  remote: rememberedRemote(),
  needsCode: false,
  show: async () => {
    if (get().open) return
    const { path } = useProject.getState()
    const folder = get().folder || (await window.api.exportsFolder())
    // Un export terminé ou raté laisse place à un nouveau ; un export en cours reste affiché.
    const reset = get().status === 'running' ? {} : { status: 'idle' as const, fraction: 0, output: null, error: null }
    set({ open: true, folder, name: path ? fileName(path) : 'Montage', ...reset })
  },
  hide: () => set({ open: false }),
  setName: (name) => set({ name }),
  setFolder: (folder) => set({ folder }),
  setQuality: (quality) => set({ quality }),
  setRemote: (remote) => {
    set({ remote, needsCode: false, error: null })
    try {
      localStorage.setItem(REMOTE_KEY, String(remote))
    } catch {
      // Sans stockage, le choix vaut pour cette session.
    }
  },
  submitCode: async (code) => {
    if (await window.api.setRenderCode(code.trim())) {
      set({ needsCode: false, error: null })
      get().start()
    } else {
      set({ error: 'Code incorrect.' })
    }
  },
  start: () => {
    const { name, folder, quality, status, remote, renderServer } = get()
    if (status === 'running') return
    const onServer = remote && renderServer !== null
    set({ status: 'running', fraction: 0, step: onServer ? 'upload' : 'encode', output: null, error: null })
    void window.api.startExport({ project: useProject.getState().project, name, folder, quality, remote: onServer })
  },
  cancel: () => void window.api.cancelExport()
}))

window.api.onExport((event) => {
  if (event.type === 'progress') useExport.setState({ fraction: event.fraction, step: event.step })
  // Un rendu fini sur le PC pendant que l'app était fermée arrive aussi ici : le panneau s'ouvre pour l'annoncer.
  if (event.type === 'done') useExport.setState({ open: true, status: 'done', fraction: 1, output: event.path })
  if (event.type === 'code-needed') useExport.setState({ status: 'idle', fraction: 0, needsCode: true })
  if (event.type === 'error') useExport.setState({ status: 'error', error: event.message })
  if (event.type === 'cancelled') useExport.setState({ status: 'idle', fraction: 0 })
})

void window.api.renderServer().then((renderServer) => useExport.setState({ renderServer }))
window.api.onRenderServer((renderServer) => useExport.setState({ renderServer }))
