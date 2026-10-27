import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { OpenedProject, Project } from '@shared/types'
import { emptyProject } from '@shared/project'
import { projectsFolder } from './folders'

export const PROJECT_EXTENSION = 'easyedit'
const settingsFile = join(app.getPath('userData'), 'settings.json')

/** « Montage du 23-10-2026 à 18h12.easyedit », avec « 2 », « 3 »… si le nom est pris. */
export function newProjectPath(date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  const base = `Montage du ${two(date.getDate())}-${two(date.getMonth() + 1)}-${date.getFullYear()} à ${two(date.getHours())}h${two(date.getMinutes())}`
  let path = join(projectsFolder, `${base}.${PROJECT_EXTENSION}`)
  for (let index = 2; existsSync(path); index++) {
    path = join(projectsFolder, `${base} ${index}.${PROJECT_EXTENSION}`)
  }
  return path
}

export async function readProject(path: string): Promise<Project> {
  return JSON.parse(await readFile(path, 'utf8')) as Project
}

export async function writeProject({ path, project }: OpenedProject): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const partial = `${path}.partial`
  await writeFile(partial, JSON.stringify(project, null, 2))
  await rename(partial, path)
  await rememberLastProject(path)
}

/** Le dernier projet ouvert, sinon un nouveau projet (écrit sur disque seulement à la première modification). */
export async function loadInitialProject(): Promise<OpenedProject> {
  const last = await lastProjectPath()
  if (last) {
    try {
      return { path: last, project: await readProject(last) }
    } catch {
      // Fichier illisible : on repart d'un projet neuf plutôt que de bloquer le lancement.
    }
  }
  return { path: newProjectPath(), project: emptyProject() }
}

export async function rememberLastProject(path: string): Promise<void> {
  await mkdir(dirname(settingsFile), { recursive: true })
  await writeFile(settingsFile, JSON.stringify({ lastProject: path }))
}

async function lastProjectPath(): Promise<string | null> {
  try {
    const { lastProject } = JSON.parse(await readFile(settingsFile, 'utf8')) as { lastProject?: string }
    return lastProject && existsSync(lastProject) ? lastProject : null
  } catch {
    return null
  }
}

export { projectsFolder }
