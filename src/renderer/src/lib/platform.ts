// Les différences entre Mac et Windows vues par l'interface.

export const isMac = window.api.platform === 'darwin'

/** La touche des raccourcis : ⌘ sur Mac, Ctrl ailleurs. */
export const commandKey = (event: { metaKey: boolean; ctrlKey: boolean }): boolean => (isMac ? event.metaKey : event.ctrlKey)

const WINDOWS_KEYS: Record<string, string> = { '⌘': 'Ctrl+', '⇧': 'Maj+', '⌥': 'Alt+', '⌫': 'Retour arrière' }

/** Un raccourci écrit à la façon du Mac (« ⇧⌫ »), affiché à la façon de Windows (« Maj+Retour arrière ») hors Mac. */
export function shortcut(mac: string): string {
  return isMac ? mac : [...mac].map((char) => WINDOWS_KEYS[char] ?? char).join('')
}

/** Le gestionnaire de fichiers du système. */
export const fileManager = isMac ? 'le Finder' : "l'Explorateur"
/** Cet ordinateur, face au PC de rendu dans le panneau d'export. */
export const thisComputer = isMac ? 'Ce Mac' : 'Ce PC'
