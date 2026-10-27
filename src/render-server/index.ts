// Service de rendu du PC Linux : il fait les exports demandés par l'app du Mac, sur le réseau de la maison, avec le
// même code que l'app (src/main/render.ts). Construit et installé par `npm run render-server` (systemd, compte de
// l'utilisateur). `node out/render-server/index.js --code` affiche le code d'appairage.
import { fork } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { Bonjour } from 'bonjour-service'
import { RENDER_PORT, RENDER_PROTOCOL, RENDER_SERVICE_TYPE } from '@shared/render-protocol'
import { configureRuntime } from '../main/runtime'
import { handler } from './http'
import { Jobs } from './jobs'

const dataFolder = join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'easy-edit-render')
// Le dépôt du projet : out/render-server/ → ../../
const resources = join(__dirname, '..', '..', 'resources')
// Bibliothèques CUDA et cuDNN pour la carte NVIDIA (voir AGENTS.md) ; sans elles, le motion blur passe par le processeur.
const cudaLibraries = join(dataFolder, 'cuda', 'lib')

interface Config {
  name: string
  code: string
}

/** Le nom affiché sur le Mac et le code d'appairage, choisi une fois pour toutes au premier lancement. */
async function config(): Promise<Config> {
  const path = join(dataFolder, 'config.json')
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8')) as Config
  const created: Config = { name: 'PC Linux', code: String(randomInt(0, 1_000_000)).padStart(6, '0') }
  await mkdir(dataFolder, { recursive: true })
  await writeFile(path, JSON.stringify(created, null, 2))
  return created
}

async function main(): Promise<void> {
  const { name, code } = await config()
  if (process.argv.includes('--code')) {
    console.log(code)
    return
  }

  const filesFolder = join(dataFolder, 'files')
  await mkdir(filesFolder, { recursive: true })
  configureRuntime({
    cacheFolder: join(dataFolder, 'cache'),
    fontsFolder: join(resources, 'fonts'),
    modelsFolder: join(resources, 'models'),
    forkBlurWorker: () => {
      const libraries = [cudaLibraries, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
      const child = fork(join(__dirname, 'motion-blur-worker.js'), [], {
        env: { ...process.env, LD_LIBRARY_PATH: libraries },
        serialization: 'advanced'
      })
      return {
        postMessage: (message) => void child.send(message as object),
        onMessage: (listener) => void child.on('message', listener),
        onExit: (listener) => void child.on('exit', listener),
        kill: () => void child.kill()
      }
    }
  })

  const jobs = new Jobs(join(dataFolder, 'jobs'), filesFolder)
  await jobs.load()

  const server = createServer(handler({ name, code, filesFolder, jobs }))
  // Les envois de clips et les rendus durent : pas de délai d'attente côté serveur.
  server.requestTimeout = 0
  server.listen(RENDER_PORT, () => console.log(`Easy Edit Render : « ${name} », port ${RENDER_PORT}, protocole ${RENDER_PROTOCOL}`))

  const bonjour = new Bonjour()
  // `host` en .local : par défaut c'est le nom nu (« whorespace. »), que le Mac ne sait pas résoudre.
  bonjour.publish({ name, type: RENDER_SERVICE_TYPE, port: RENDER_PORT, host: `${hostname().split('.')[0]}.local`, disableIPv6: true })

  const stop = (): void => {
    bonjour.unpublishAll(() => bonjour.destroy())
    server.close()
    setTimeout(() => process.exit(0), 1000).unref()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
