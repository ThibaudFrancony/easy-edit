import { moveSegments, removeSegments, splitAt, toggleLink } from '@shared/project'
import { player } from '@/engine/player'
import { useProject } from './project'
import { instantLayout, useTimeline } from './timeline'

// Les actions de montage, appelées par le menu Montage, les raccourcis et le clic droit.

const selection = (): Set<string> => useTimeline.getState().selection

/** S : coupe la sélection (et ce qui lui est lié) au curseur ; sans sélection, tout ce qui est sous le curseur. */
export function splitAtPlayhead(): void {
  const time = player.time()
  useProject.getState().update((draft) => {
    splitAt(draft, selection(), time)
  })
}

/** ⌫ laisse un trou ; ⇧⌫ referme le trou en faisant reculer la suite. */
export function deleteSelection(closeGap: boolean): void {
  const ids = selection()
  if (ids.size === 0) return
  useProject.getState().update((draft) => removeSegments(draft, ids, closeGap))
  useTimeline.getState().setSelection(new Set())
}

export function toggleLinkSelection(): void {
  const ids = selection()
  if (ids.size === 0) return
  useProject.getState().update((draft) => toggleLink(draft, ids))
}

export function selectAll(): void {
  useTimeline.getState().setSelection(new Set(useProject.getState().project.segments.map((s) => s.id)))
}

/** Fin d'un déplacement à la souris : les morceaux sont déjà affichés à leur place, ils n'ont pas à y glisser. */
export function commitDrag(): void {
  const { drag, setDrag } = useTimeline.getState()
  if (!drag) return
  if (Math.abs(drag.delta) > 1e-6) {
    instantLayout()
    useProject.getState().update((draft) => moveSegments(draft, drag.ids, drag.delta))
  }
  setDrag(null)
}

/** Retire de la sélection les morceaux qui n'existent plus (après une suppression, une annulation…). */
export function pruneSelection(): void {
  const { selection: current, setSelection } = useTimeline.getState()
  if (current.size === 0) return
  const existing = new Set(useProject.getState().project.segments.map((s) => s.id))
  const kept = new Set([...current].filter((id) => existing.has(id)))
  if (kept.size !== current.size) setSelection(kept)
}
