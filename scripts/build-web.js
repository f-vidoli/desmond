import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const dist = join(root, 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const filter = (source) => !source.split('/').some((part) => part === '.opencode' || part === 'node_modules')

for (const entry of ['index.html', 'kernel.js', 'app', 'plugins', 'seed-manifest.json', 'shared_memory.json', 'plugin_pointer.json', 'settings.json']) {
  cpSync(join(root, entry), join(dist, entry), { recursive: true, filter })
}
