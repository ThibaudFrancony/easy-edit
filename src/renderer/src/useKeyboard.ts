import { useEffect } from 'react'
import { player, usePlayback } from '@/engine/player'
import { useTimeline } from '@/state/timeline'

/** Raccourcis de lecture, comme dans les logiciels de montage pros. Ceux du montage (S, ⌫, ⌘L…) sont dans le menu Montage. */
export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input[type="text"], textarea, [contenteditable="true"]')) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const actions: Record<string, () => void> = {
        ' ': () => player.toggle(),
        j: () => player.shuttle(-1),
        k: () => player.shuttle(0),
        l: () => player.shuttle(1),
        ArrowLeft: () => player.step(event.shiftKey ? -10 : -1),
        ArrowRight: () => player.step(event.shiftKey ? 10 : 1),
        Home: () => player.seek(0),
        End: () => player.seek(usePlayback.getState().duration),
        Escape: () => useTimeline.getState().setSelection(new Set())
      }
      const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
