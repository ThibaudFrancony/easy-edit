import { join } from 'node:path'
import { app } from 'electron'

// Tous les dossiers de l'app, rangés dans le dossier Vidéos de l'utilisateur : `~/Movies` sur Mac, « Vidéos » sur Windows.

const videos = app.getPath('videos')

/** Les clips de ReplayClip (lus sur place, jamais copiés). */
export const clipsFolder = join(videos, 'Clips')
const appFolder = join(videos, 'Easy Edit')
export const projectsFolder = join(appFolder, 'Projets')
export const exportsFolder = join(appFolder, 'Exports')
/** Les fichiers importés y sont copiés : un projet ne dépend jamais d'un fichier qui traîne dans Téléchargements. */
export const importedVideosFolder = join(appFolder, 'Vidéos')
export const soundsFolder = join(appFolder, 'Sons')
export const imagesFolder = join(appFolder, 'Images')
// Pas « Cache » : ce dossier appartient au cache HTTP de Chromium.
export const cacheFolder = join(app.getPath('userData'), 'Media')
