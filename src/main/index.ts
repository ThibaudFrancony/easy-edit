import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from 'electron'
import type { ExportEvent, ExportRequest, MenuAction, OpenedProject } from '@shared/types'
import { emptyProject } from '@shared/project'
import { buildExport, exportsFolder, freeExportPath } from './export'
import { type RunningFFmpeg, runFFmpeg } from './ffmpeg-run'
import { AUDIO_EXTENSIONS, audioTrack, clipDetails, clipsFolder, ffmpeg, listClips, thumbnail } from './media'
import {
  PROJECT_EXTENSION, loadInitialProject, newProjectPath, projectsFolder, readProject, rememberLastProject, writeProject
} from './projects'
import { handleMediaProtocol, registerMediaScheme } from './protocol'

registerMediaScheme()

let window: BrowserWindow | null = null

function createWindow(): void {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    // Même couleur que l'interface : pas de flash blanc à l'ouverture.
    backgroundColor: '#0B0C0F',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // La lecture (et l'image calée sur le son) continue quand la fenêtre passe derrière une autre.
      backgroundThrottling: false
    }
  })
  window.once('ready-to-show', () => window?.show())
  window.on('closed', () => (window = null))

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const send = (channel: string, payload: unknown): void => window?.webContents.send(channel, payload)
const menuAction = (action: MenuAction) => (): void => send('menu', action)

async function newProject(): Promise<OpenedProject> {
  return { path: newProjectPath(), project: emptyProject() }
}

async function openProject(): Promise<OpenedProject | null> {
  const options = {
    defaultPath: projectsFolder,
    properties: ['openFile' as const],
    filters: [{ name: 'Projet Easy Edit', extensions: [PROJECT_EXTENSION] }]
  }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  const opened = { path, project: await readProject(path) }
  await rememberLastProject(path)
  return opened
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'Fichier',
        submenu: [
          { label: 'Nouveau projet', accelerator: 'CmdOrCtrl+N', click: async () => send('project-opened', await newProject()) },
          {
            label: 'Ouvrir…',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const opened = await openProject()
              if (opened) send('project-opened', opened)
            }
          },
          { type: 'separator' },
          { label: 'Exporter…', accelerator: 'CmdOrCtrl+E', click: menuAction('export') },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      {
        label: 'Édition',
        submenu: [
          { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: menuAction('undo') },
          { label: 'Rétablir', accelerator: 'Shift+CmdOrCtrl+Z', registerAccelerator: false, click: menuAction('redo') },
          { type: 'separator' },
          { role: 'cut', label: 'Couper le texte' },
          { role: 'copy', label: 'Copier' },
          { role: 'paste', label: 'Coller' },
          { label: 'Tout sélectionner', accelerator: 'CmdOrCtrl+A', registerAccelerator: false, click: menuAction('select-all') }
        ]
      },
      {
        label: 'Montage',
        // Raccourcis affichés ici mais gérés par l'interface (useKeyboard.ts), pour ne pas gêner la saisie de texte.
        submenu: [
          { label: 'Couper au curseur', accelerator: 'S', registerAccelerator: false, click: menuAction('split') },
          { label: 'Supprimer', accelerator: 'Backspace', registerAccelerator: false, click: menuAction('delete') },
          { label: 'Supprimer et refermer le trou', accelerator: 'Shift+Backspace', registerAccelerator: false, click: menuAction('delete-close-gap') },
          { type: 'separator' },
          { label: 'Lier ou délier', accelerator: 'CmdOrCtrl+L', registerAccelerator: false, click: menuAction('toggle-link') }
        ]
      },
      {
        label: 'Présentation',
        submenu: [
          { label: 'Zoom avant', accelerator: 'CmdOrCtrl+=', click: menuAction('zoom-in') },
          { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: menuAction('zoom-out') },
          { label: 'Ajuster la timeline', accelerator: 'Shift+Z', registerAccelerator: false, click: menuAction('zoom-fit') },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }])
        ]
      },
      { role: 'windowMenu' }
    ])
  )
}

ipcMain.handle('clips:list', () => listClips())
ipcMain.handle('clips:details', (_event, path: string) => clipDetails(path))
ipcMain.handle('clips:thumbnail', (_event, path: string) => thumbnail(path))
ipcMain.handle('clips:audio-track', (_event, path: string, stream: number) => audioTrack(path, stream))
ipcMain.handle('project:initial', () => loadInitialProject())
ipcMain.handle('project:save', (_event, opened: OpenedProject) => writeProject(opened))
ipcMain.handle('project:new', () => newProject())
ipcMain.handle('project:open', () => openProject())
ipcMain.handle('reveal', (_event, path: string) => shell.showItemInFolder(path))
ipcMain.handle('audio:pick', async () => {
  const options = {
    defaultPath: join(app.getPath('home'), 'Music'),
    properties: ['openFile' as const, 'multiSelections' as const],
    filters: [{ name: 'Sons', extensions: AUDIO_EXTENSIONS }]
  }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
})
ipcMain.handle('clips:open-folder', async () => {
  await mkdir(clipsFolder, { recursive: true })
  await shell.openPath(clipsFolder)
})

// ——— Export ———

let running: RunningFFmpeg | null = null
const sendExport = (event: ExportEvent): void => send('export', event)

ipcMain.handle('export:folder', () => exportsFolder)
ipcMain.handle('export:pick-folder', async (_event, current: string) => {
  const options = { defaultPath: current, properties: ['openDirectory' as const, 'createDirectory' as const] }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
})
ipcMain.handle('export:cancel', () => running?.cancel())
ipcMain.handle('export:start', async (_event, request: ExportRequest) => {
  if (running) return
  try {
    await mkdir(request.folder, { recursive: true })
    const output = freeExportPath(request.folder, request.name)
    const { args, duration } = await buildExport(request.project, request.quality, output)
    running = runFFmpeg(ffmpeg, args, output, duration, (fraction) => sendExport({ type: 'progress', fraction }))
    running.done
      .then(
        () => sendExport({ type: 'done', path: output }),
        (error: Error) => sendExport(error.name === 'AbortError' ? { type: 'cancelled' } : { type: 'error', message: error.message })
      )
      .finally(() => (running = null))
  } catch (error) {
    sendExport({ type: 'error', message: (error as Error).message })
  }
})

app.whenReady().then(() => {
  // L'app empaquetée a son icône ; en développement, on remplace celle d'Electron dans le Dock.
  if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
  handleMediaProtocol()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
