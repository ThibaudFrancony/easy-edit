import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from 'electron'
import type { MenuAction, OpenedProject } from '@shared/types'
import { emptyProject } from '@shared/project'
import { audioTrack, clipDetails, clipsFolder, listClips, thumbnail } from './media'
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
          { role: 'close' }
        ]
      },
      { role: 'editMenu' },
      {
        label: 'Présentation',
        submenu: [
          { label: 'Zoom avant', accelerator: 'CmdOrCtrl+=', click: menuAction('zoom-in') },
          { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: menuAction('zoom-out') },
          { label: 'Ajuster la timeline', accelerator: 'Shift+Z', click: menuAction('zoom-fit') },
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
ipcMain.handle('clips:open-folder', async () => {
  await mkdir(clipsFolder, { recursive: true })
  await shell.openPath(clipsFolder)
})

app.whenReady().then(() => {
  handleMediaProtocol()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
