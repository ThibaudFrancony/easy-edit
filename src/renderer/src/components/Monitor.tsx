import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { epoch, player } from '@/engine/player'
import { useProject } from '@/state/project'
import { fade } from '@/lib/motion'
import { VideoLayers, frameSize } from './Preview'
import styles from './Monitor.module.css'

/**
 * La fenêtre du deuxième écran : l'image seule, en plein écran. Le projet et l'horloge viennent de la fenêtre
 * principale, qui garde le son ; rien n'est enregistré d'ici.
 */
export function Monitor(): React.JSX.Element {
  const [ratio, setRatio] = useState<string | null>(null)

  useEffect(() => {
    player.follow({ time: 0, rate: 0, at: epoch() })
    const off = window.api.onMonitorState((state) => {
      if (state.project) {
        useProject.setState({ project: state.project })
        player.setProject(state.project)
      }
      if (state.ratio) setRatio(state.ratio)
      if (state.clock) player.follow(state.clock)
    })
    window.api.monitorReady()
    return off
  }, [])

  return (
    <div className={styles.monitor}>
      {ratio && (
        <motion.div className={styles.frame} style={frameSize(ratio)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
          <VideoLayers />
        </motion.div>
      )}
    </div>
  )
}
