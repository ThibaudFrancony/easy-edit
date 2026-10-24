import { create } from 'zustand'
import type { ClipDetails, LibraryFile } from '@shared/types'

interface LibraryState {
  /** Clips vidéo et sons importés. */
  files: LibraryFile[]
  loaded: boolean
  details: Record<string, ClipDetails>
  /** Le fichier en train d'être glissé vers la timeline. */
  dragged: LibraryFile | null
  refresh(): Promise<void>
  /** Copie des sons dans la bibliothèque, puis la relit. Renvoie les chemins des copies. */
  importSounds(paths: string[]): Promise<string[]>
  setDragged(file: LibraryFile | null): void
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  files: [],
  loaded: false,
  details: {},
  dragged: null,
  refresh: async () => {
    const files = await window.api.listFiles()
    const current = get().files
    const same = files.length === current.length && files.every((f, i) => f.path === current[i]?.path && f.modifiedAt === current[i]?.modifiedAt)
    if (!same || !get().loaded) set({ files, loaded: true })
    await Promise.all(files.filter((f) => !get().details[f.path]).map((f) => clipDetails(f.path).catch(() => null)))
  },
  importSounds: async (paths) => {
    const imported = await window.api.importSounds(paths)
    if (imported.length > 0) await get().refresh()
    return imported
  },
  setDragged: (dragged) => set({ dragged })
}))

/** Infos d'un clip, chargées une fois puis gardées. */
export async function clipDetails(path: string): Promise<ClipDetails> {
  const known = useLibrary.getState().details[path]
  if (known) return known
  const details = await window.api.clipDetails(path)
  useLibrary.setState((state) => ({ details: { ...state.details, [path]: details } }))
  return details
}

const thumbnails = new Map<string, Promise<string>>()

export function thumbnailURL(path: string): Promise<string> {
  let pending = thumbnails.get(path)
  if (!pending) {
    pending = window.api.thumbnail(path)
    pending.catch(() => thumbnails.delete(path))
    thumbnails.set(path, pending)
  }
  return pending
}
