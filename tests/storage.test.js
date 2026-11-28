import assert from 'node:assert/strict'
import test from 'node:test'
import { seedBundledFiles } from '../app/storage.js'
import { MemoryHost } from './memory-host.js'

test('seed overwrites maps, removes stale plugins and adds missing files', async () => {
  const manifest = JSON.stringify({
    version: 3,
    overwrite: ['shared_memory.json'],
    remove: ['plugins/old'],
    files: ['shared_memory.json', 'new.js']
  })
  const host = new MemoryHost({
    'seed-manifest.json': manifest,
    'bundled/seed-manifest.json': manifest,
    'bundled/shared_memory.json': '{"ok":true}',
    'bundled/new.js': 'export const ok = true',
    'shared_memory.json': '{"ok":false}',
    'plugins/old/old.js': 'old',
    'system:seed-version': '2'
  })
  host.readBundled = (path) => host.readText(`bundled/${path}`)

  assert.equal(await seedBundledFiles(host), true)
  assert.equal(await host.readText('shared_memory.json'), '{"ok":true}')
  assert.equal(await host.readText('new.js'), 'export const ok = true')
  assert.equal(await host.exists('plugins/old'), false)
  assert.equal(await host.readText('system:seed-version'), '3')
})
