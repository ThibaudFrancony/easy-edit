// Ce qui change entre l'app (Electron) et le service de rendu du PC Linux (Node seul) : les dossiers et la façon de
// lancer un processus de calcul. Réglé une fois au démarrage, avant tout export.

/** Un processus de calcul : `utilityProcess` dans l'app, `child_process.fork` dans le service de rendu. */
export interface WorkerProcess {
  postMessage(message: unknown): void
  onMessage(listener: (message: unknown) => void): void
  onExit(listener: () => void): void
  kill(): void
}

export interface Runtime {
  /** Pistes audio extraites, morceaux floutés… */
  cacheFolder: string
  /** Polices des sous-titres. */
  fontsFolder: string
  /** Modèles (RIFE du motion blur). */
  modelsFolder: string
  forkBlurWorker(): WorkerProcess
}

export const runtime: Runtime = {
  cacheFolder: '',
  fontsFolder: '',
  modelsFolder: '',
  forkBlurWorker: () => {
    throw new Error('configureRuntime n’a pas été appelé.')
  }
}

export function configureRuntime(values: Runtime): void {
  Object.assign(runtime, values)
}
