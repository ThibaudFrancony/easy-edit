import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { EasyEditAPI, ExportEvent, MenuAction, OpenedProject, TranscribePhase } from '@shared/types'
import { toMediaURL } from '@shared/media-url'

function listen<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: EasyEditAPI = {
  listFiles: () => ipcRenderer.invoke('library:list'),
  clipDetails: (path) => ipcRenderer.invoke('clips:details', path),
  thumbnail: (path) => ipcRenderer.invoke('clips:thumbnail', path),
  audioTrack: (path, stream) => ipcRenderer.invoke('clips:audio-track', path, stream),
  importFiles: (paths) => ipcRenderer.invoke('library:import', paths),
  pickFiles: () => ipcRenderer.invoke('library:pick'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  mediaURL: (path) => toMediaURL(path),
  loadInitialProject: () => ipcRenderer.invoke('project:initial'),
  saveProject: (opened) => ipcRenderer.invoke('project:save', opened),
  newProject: () => ipcRenderer.invoke('project:new'),
  openProject: () => ipcRenderer.invoke('project:open'),
  revealInFinder: (path) => ipcRenderer.invoke('reveal', path),
  openClipsFolder: () => ipcRenderer.invoke('clips:open-folder'),
  onProjectOpened: (callback) => listen<OpenedProject>('project-opened', callback),
  onMenu: (callback) => listen<MenuAction>('menu', callback),
  exportsFolder: () => ipcRenderer.invoke('export:folder'),
  pickFolder: (current) => ipcRenderer.invoke('export:pick-folder', current),
  startExport: (request) => ipcRenderer.invoke('export:start', request),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExport: (callback) => listen<ExportEvent>('export', callback),
  transcribe: (samples) => ipcRenderer.invoke('transcribe', samples),
  onTranscribeProgress: (callback) => listen<{ phase: TranscribePhase; fraction: number | null }>('transcribe-progress', callback)
}

contextBridge.exposeInMainWorld('api', api)
