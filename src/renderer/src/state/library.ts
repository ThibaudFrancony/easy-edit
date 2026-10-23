import { create } from 'zustand'
import type { ClipDetails, ClipFile } from '@shared/types'

interface LibraryState {
  clips: ClipFile[]
  loaded: boolean
  details: Record<string, ClipDetails>
  /** Le clip en train d'être glissé vers la timeline. */
  dragged: ClipFile | null
  refresh(): Promise<void>
  setDragged(clip: ClipFile | null): void
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  clips: [],
  loaded: false,
  details: {},
  dragged: null,
  refresh: async () => {
    const clips = await window.api.listClips()
    const same = clips.length === get().clips.length && clips.every((c, i) => c.path === get().clips[i]?.path && c.modifiedAt === get().clips[i]?.modifiedAt)
    if (!same || !get().loaded) set({ clips, loaded: true })
    await Promise.all(clips.filter((c) => !get().details[c.path]).map((c) => clipDetails(c.path).catch(() => null)))
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
