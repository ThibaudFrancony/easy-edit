import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  REMOTE_FILE_NAME, RENDER_CODE_HEADER, RENDER_PROTOCOL, type RenderJobRequest, type RenderStatus
} from '@shared/render-protocol'
import type { Jobs } from './jobs'

interface Context {
  name: string
  code: string
  filesFolder: string
  jobs: Jobs
}

/** Seulement le réseau de la maison : adresses privées, locales ou de la machine elle-même. */
function isPrivate(address: string | undefined): boolean {
  if (!address) return false
  const ip = address.replace(/^::ffff:/, '')
  if (ip === '::1' || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip)) return true
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b! >= 16 && b! <= 31) || (a === 169 && b === 254)
}

// Après 10 codes faux, plus aucun essai pendant une minute : un code à 6 chiffres ne se devine pas au hasard.
let failures = 0
let lockedUntil = 0

function authorized(request: IncomingMessage, code: string): boolean {
  if (Date.now() < lockedUntil) return false
  if (request.headers[RENDER_CODE_HEADER] === code) {
    failures = 0
    return true
  }
  if (++failures >= 10) {
    failures = 0
    lockedUntil = Date.now() + 60_000
  }
  return false
}

const send = (response: ServerResponse, status: number, body?: unknown): void => {
  if (body === undefined) {
    response.writeHead(status).end()
    return
  }
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request as AsyncIterable<Buffer>) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

/** Reçoit un fichier ; il n'est gardé que si son contenu correspond bien à son nom (son empreinte). */
async function receiveFile(request: IncomingMessage, folder: string, name: string): Promise<boolean> {
  const target = join(folder, name)
  const partial = `${target}.partial`
  const hash = createHash('sha256')
  const hashing = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    }
  })
  try {
    await pipeline(request, hashing, createWriteStream(partial))
    if (!name.startsWith(hash.digest('hex'))) {
      await rm(partial, { force: true })
      return false
    }
    await rename(partial, target)
    return true
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

export function handler(context: Context) {
  const { jobs, filesFolder } = context
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!isPrivate(request.socket.remoteAddress)) return send(response, 403)
    const path = (request.url ?? '/').split('?')[0]!.split('/').filter(Boolean)
    const route = `${request.method} /${path[0] ?? ''}${path.length > 2 ? `/:id/${path[2]}` : path.length === 2 ? '/:id' : ''}`
    const id = path[1] ?? ''

    try {
      if (route === 'GET /status') return send(response, 200, { name: context.name, protocol: RENDER_PROTOCOL } satisfies RenderStatus)
      if (!authorized(request, context.code)) return send(response, 401)

      switch (route) {
        case 'GET /check':
          return send(response, 204)

        case 'HEAD /files/:id':
          return send(response, REMOTE_FILE_NAME.test(id) && existsSync(join(filesFolder, id)) ? 200 : 404)

        case 'PUT /files/:id':
          if (!REMOTE_FILE_NAME.test(id)) return send(response, 400)
          return send(response, (await receiveFile(request, filesFolder, id)) ? 204 : 422)

        case 'POST /jobs': {
          const body = await readJson<RenderJobRequest>(request)
          const missing = jobs.missingFiles(body.project)
          if (missing.length > 0) return send(response, 409, { missing })
          return send(response, 201, { id: (await jobs.add(body)).id })
        }

        case 'GET /jobs':
          return send(response, 200, jobs.list())

        case 'GET /jobs/:id/events': {
          if (!jobs.get(id)) return send(response, 404)
          response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
          const stop = jobs.watch(id, (job) => {
            response.write(`data: ${JSON.stringify(job)}\n\n`)
            if (job.status !== 'queued' && job.status !== 'running') response.end()
          })
          response.on('close', stop)
          return
        }

        case 'GET /jobs/:id/output': {
          const output = jobs.output(id)
          if (jobs.get(id)?.status !== 'done' || !existsSync(output)) return send(response, 404)
          response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': (await stat(output)).size })
          await pipeline(createReadStream(output), response)
          return
        }

        case 'DELETE /jobs/:id':
          await jobs.remove(id)
          return send(response, 204)

        default:
          return send(response, 404)
      }
    } catch (error) {
      if (!response.headersSent) send(response, 500, { error: (error as Error).message })
      else response.destroy()
    }
  }
}
