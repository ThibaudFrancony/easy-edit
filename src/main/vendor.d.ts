declare module 'ffprobe-static' {
  const ffprobe: { path: string }
  export default ffprobe
}

// electron-vite : `import chemin from './fichier?modulePath'` donne le chemin du fichier construit (processus utilitaire).
declare module '*?modulePath' {
  const path: string
  export default path
}
