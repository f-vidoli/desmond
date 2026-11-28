import { downloadBytes, downloadGithubZip } from './github.js'
import { readZip, unpackFiles } from './zip.js'

const DECODER = new TextDecoder()

function unique(list) {
  return [...new Set(list)]
}

function toBase64(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function validId(id) {
  return /^[a-zA-Z0-9._-]+$/.test(String(id || ''))
}

async function walk(host, dir, base = dir) {
  const files = []
  for (const entry of await host.list(dir)) {
    const path = `${dir}/${entry.name}`.replace(/\/{2,}/g, '/')
    if (entry.type === 'dir') {
      files.push(...(await walk(host, path, base)))
    } else {
      files.push({ path: path.slice(base.length + 1), bytes: await host.readBytes(path) })
    }
  }
  return files
}

export class PluginManager {
  constructor(kernel) {
    this.kernel = kernel
    this.host = kernel.host
  }

  async installZip(bytes) {
    return this.installFiles(await unpackFiles(await readZip(bytes)))
  }

  async installUrl(url) {
    const bytes = /github\.com/i.test(url) ? await downloadGithubZip(url) : await downloadBytes(url)
    return this.installZip(bytes)
  }

  async installFiles(files) {
    const manifests = files.filter((file) => /(^|\/)manifest\.json$/.test(file.name))
    if (!manifests.length) throw new Error('No manifest.json found in the package')
    const installed = []
    for (const manifestFile of manifests) {
      const manifest = JSON.parse(DECODER.decode(manifestFile.bytes))
      const pluginId = manifest.name || manifest.id
      if (!validId(pluginId)) throw new Error('Invalid plugin id in manifest')
      const prefix = manifestFile.name.slice(0, -'manifest.json'.length)
      for (const file of files) {
        if (prefix && !file.name.startsWith(prefix)) continue
        const relative = prefix ? file.name.slice(prefix.length) : file.name
        if (!relative || relative.split('/').includes('..')) continue
        await this.host.writeBytes(`plugins/${pluginId}/${relative}`, file.bytes)
      }
      await this.subscribePlugin(pluginId, manifest)
      installed.push(pluginId)
    }
    await this.kernel.refreshPlugins()
    this.kernel.emit('plugins', [...this.kernel.plugins.values()])
    return installed
  }

  async subscribePlugin(pluginId, manifest) {
    const memory = this.kernel.memory
    const pointer = this.kernel.pointer
    const subscriptions = manifest.subscriptions || {}
    const pointerEntries = subscriptions.plugin_pointer || {}
    const roles = subscriptions.roles || manifest.provides || []

    if ((subscriptions.start || []).includes(pluginId) || roles.includes('service') || manifest.entry?.service) {
      memory['start-subscription-list'] = unique([
        ...(memory['start-subscription-list'] || []),
        pluginId
      ])
    }
    if ((subscriptions.feed || []).includes(pluginId) || roles.includes('widget') || (manifest.widgets || []).length) {
      memory['feed-subscription-list'] = unique([
        ...(memory['feed-subscription-list'] || []),
        pluginId
      ])
    }
    memory.watchdogs ||= {}
    for (const [key, target] of Object.entries(subscriptions.wachdogs || manifest.watchdogs || {})) {
      memory.watchdogs[key] = target
    }
    pointer.widgets ||= {}
    pointer.services ||= {}
    const widgets = pointerEntries.widgets && !Array.isArray(pointerEntries.widgets)
      ? pointerEntries.widgets
      : Object.fromEntries((manifest.widgets || []).map((widget) => [widget, pluginId]))
    const services = pointerEntries.services && !Array.isArray(pointerEntries.services)
      ? pointerEntries.services
      : Object.fromEntries((manifest.services || []).map((service) => [service, pluginId]))
    Object.assign(pointer.widgets, widgets)
    Object.assign(pointer.services, services)
    if (manifest.settings || subscriptions.settings) {
      await this.kernel.savePluginSettings(pluginId, {})
    }
    await Promise.all([
      this.kernel.memoryFile.save(),
      this.kernel.pointerFile.save()
    ])
  }

  async exportBundle() {
    const plugins = []
    for (const plugin of this.kernel.plugins.values()) {
      const files = await walk(this.host, `plugins/${plugin.id}`)
      plugins.push({
        id: plugin.id,
        files: files.map((file) => ({
          path: file.path,
          bytes: toBase64(file.bytes)
        }))
      })
    }
    return JSON.stringify({ format: 'desmond-plugins', version: 1, plugins }, null, 2)
  }

  async importBundle(text) {
    const bundle = JSON.parse(text)
    if (bundle.format !== 'desmond-plugins' || !Array.isArray(bundle.plugins)) {
      throw new Error('Not a Desmond plugin bundle')
    }
    const ids = []
    for (const plugin of bundle.plugins) {
      if (!validId(plugin.id)) throw new Error('Invalid plugin id in bundle')
      const files = plugin.files.map((file) => {
        if (file.path.split('/').includes('..')) throw new Error('Unsafe path in bundle')
        const binary = atob(file.bytes)
        return {
          name: `${plugin.id}/${file.path}`,
          bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0))
        }
      })
      ids.push(...(await this.installFiles(files)))
    }
    return ids
  }
}
