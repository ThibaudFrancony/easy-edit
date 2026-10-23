import { create } from 'zustand'
import type { ExportQuality } from '@shared/types'
import { fileName } from '@/lib/format'
import { useProject } from './project'

type Status = 'idle' | 'running' | 'done' | 'error'

interface ExportState {
  open: boolean
  status: Status
  fraction: number
  /** Le fichier produit, une fois l'export terminé. */
  output: string | null
  error: string | null
  name: string
  folder: string
  quality: ExportQuality
  show(): Promise<void>
  hide(): void
  setName(name: string): void
  setFolder(folder: string): void
  setQuality(quality: ExportQuality): void
  start(): void
  cancel(): void
}

export const useExport = create<ExportState>()((set, get) => ({
  open: false,
  status: 'idle',
  fraction: 0,
  output: null,
  error: null,
  name: '',
  folder: '',
  quality: 'source',
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
  start: () => {
    const { name, folder, quality, status } = get()
    if (status === 'running') return
    set({ status: 'running', fraction: 0, output: null, error: null })
    void window.api.startExport({ project: useProject.getState().project, name, folder, quality })
  },
  cancel: () => void window.api.cancelExport()
}))

window.api.onExport((event) => {
  if (event.type === 'progress') useExport.setState({ fraction: event.fraction })
  if (event.type === 'done') useExport.setState({ status: 'done', fraction: 1, output: event.path })
  if (event.type === 'error') useExport.setState({ status: 'error', error: event.message })
  if (event.type === 'cancelled') useExport.setState({ status: 'idle', fraction: 0 })
})
