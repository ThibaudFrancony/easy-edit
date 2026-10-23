import { create } from 'zustand'
import { produce } from 'immer'
import type { OpenedProject, Project } from '@shared/types'
import { emptyProject } from '@shared/project'

interface ProjectState {
  path: string | null
  project: Project
  load(opened: OpenedProject): void
  /** Seule façon de modifier le montage : la modification est enregistrée automatiquement (et annulable au lot 2). */
  update(recipe: (draft: Project) => void): void
}

export const useProject = create<ProjectState>()((set, get) => ({
  path: null,
  project: emptyProject(),
  load: (opened) => {
    flushSave()
    set({ path: opened.path, project: opened.project })
  },
  update: (recipe) => {
    const next = produce(get().project, recipe)
    if (next === get().project) return
    set({ project: next })
    scheduleSave()
  }
}))

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
