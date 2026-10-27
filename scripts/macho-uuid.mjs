// Donne à l'exécutable de l'app son propre UUID Mach-O (LC_UUID), dérivé de l'identifiant de l'app.
// Sans ça, il garde celui d'Electron, partagé par toutes les apps Electron de la même version (Claude, etc.) :
// macOS retient l'autorisation « Réseau local » par cet UUID et la confond d'une app à l'autre.
// L'UUID est stable d'une construction à l'autre, donc l'autorisation n'est pas redemandée à chaque installation.
// À lancer avant de signer : node scripts/macho-uuid.mjs <exécutable> <identifiant>
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [path, id] = process.argv.slice(2)
if (!path || !id) throw new Error('usage : macho-uuid.mjs <exécutable> <identifiant>')

const MH_MAGIC_64 = 0xfeedfacf
const LC_UUID = 0x1b

const binary = readFileSync(path)
if (binary.readUInt32LE(0) !== MH_MAGIC_64) throw new Error(`${path} n'est pas un Mach-O 64 bits (une seule architecture)`)

const commandCount = binary.readUInt32LE(16)
let offset = 32
for (let i = 0; i < commandCount; i++) {
  const command = binary.readUInt32LE(offset)
  if (command === LC_UUID) {
    const uuid = createHash('sha256').update(id).digest().subarray(0, 16)
    uuid[6] = (uuid[6] & 0x0f) | 0x50 // version 5 : dérivé d'un nom
    uuid[8] = (uuid[8] & 0x3f) | 0x80
    uuid.copy(binary, offset + 8)
    writeFileSync(path, binary)
    process.exit(0)
  }
  offset += binary.readUInt32LE(offset + 4)
}
throw new Error(`${path} n'a pas de LC_UUID`)
