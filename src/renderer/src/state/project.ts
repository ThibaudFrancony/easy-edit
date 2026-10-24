import { create } from 'zustand'
import { produce } from 'immer'
import type { OpenedProject, Project } from '@shared/types'
import { emptyProject, upgradeProject } from '@shared/project'

/** Nombre d'étapes gardées pour Annuler. Les projets étant immuables, une étape ne coûte que ce qui a changé. */
const HISTORY_LIMIT = 200

interface ProjectState {
  path: string | null
  project: Project
  past: Project[]
  future: Project[]
  load(opened: OpenedProject): void
  /**
   * Seule façon de modifier le montage : la modification est annulable et enregistrée automatiquement.
   * Les modifications successives qui partagent un `mergeKey` (un curseur qu'on fait glisser) ne font qu'une étape d'annulation.
   */
  update(recipe: (draft: Project) => void, mergeKey?: string): void
  undo(): void
  redo(): void
}

export const useProject = create<ProjectState>()((set, get) => ({
  path: null,
  project: emptyProject(),
  past: [],
  future: [],
  load: (opened) => {
    flushSave()
    set({ path: opened.path, project: upgradeProject(opened.project), past: [], future: [] })
  },
  update: (recipe, mergeKey) => {
    const { project, past } = get()
    const next = produce(project, recipe)
    if (next === project) return
    const merge = mergeKey !== undefined && mergeKey === lastMerge.key && performance.now() - lastMerge.at < 1500
    lastMerge = { key: mergeKey, at: performance.now() }
    set({ project: next, past: merge ? past : [...past, project].slice(-HISTORY_LIMIT), future: [] })
    scheduleSave()
  },
  undo: () => {
    const { project, past, future } = get()
    const previous = past.at(-1)
    if (!previous) return
    set({ project: previous, past: past.slice(0, -1), future: [project, ...future] })
    scheduleSave()
  },
  redo: () => {
    const { project, past, future } = get()
    const next = future[0]
    if (!next) return
    set({ project: next, past: [...past, project], future: future.slice(1) })
    scheduleSave()
  }
}))

let lastMerge: { key: string | undefined; at: number } = { key: undefined, at: 0 }
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 400)
}

function flushSave(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  const { path, project } = useProject.getState()
  if (path) void window.api.saveProject({ path, project })
}

window.addEventListener('beforeunload', flushSave)
