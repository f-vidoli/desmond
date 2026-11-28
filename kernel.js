'use strict'

import { JsonFile, seedBundledFiles } from './app/storage.js'

const DEFAULT_MEMORY = {
  louncher: 'default-louncher',
  'package-manager': 'default-pm',
  'start-subscription-list': [],
  'feed-subscription-list': [],
  watchdogs: {}
}

const DEFAULT_POINTER = { widgets: {}, services: {} }

const DEFAULT_SETTINGS = {
  theme: { mode: 'dark', principal: 'amber' }
}

function safePath(path) {
  const clean = String(path).replace(/\\/g, '/').replace(/^\/+/, '')
  if (clean.split('/').includes('..')) throw new Error(`Unsafe path: ${path}`)
  return clean
}

function resolveModulePath(fromPath, specifier) {
  const parts = fromPath.split('/').slice(0, -1)
  for (const part of String(specifier).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return safePath(parts.join('/'))
}

function moduleSourceUrl(source) {
  const bytes = new TextEncoder().encode(source)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:text/javascript;base64,${btoa(binary)}`
}

async function bundleModule(host, path, cache, loading) {
  const target = safePath(path)
  if (cache.has(target)) return cache.get(target)
  if (loading.has(target)) throw new Error(`Circular module import: ${target}`)
  loading.add(target)
  const source = await host.readText(target)
  const placeholders = new Map()
  let bundled = source.replace(
    /(from\s+|import\s*)(['"])(\.\.?\/[^'"]+)\2/g,
    (match, prefix, quote, specifier) => {
      const placeholder = `__DESMOND_MODULE_${placeholders.size}__`
      placeholders.set(placeholder, resolveModulePath(target, specifier))
      return `${prefix}${quote}${placeholder}${quote}`
    }
  )
  for (const [placeholder, dependency] of placeholders) {
    const url = await bundleModule(host, dependency, cache, loading)
    bundled = bundled.replaceAll(placeholder, url)
  }
  const url = moduleSourceUrl(bundled)
  cache.set(target, url)
  loading.delete(target)
  return url
}

export class Kernel {
  constructor(host) {
    this.host = host
    this.memoryFile = new JsonFile(host, 'shared_memory.json', DEFAULT_MEMORY)
    this.pointerFile = new JsonFile(host, 'plugin_pointer.json', DEFAULT_POINTER)
    this.settingsFile = new JsonFile(host, 'settings.json', DEFAULT_SETTINGS)
    this.plugins = new Map()
    this.services = new Map()
    this.watchdogs = []
    this.widgets = []
    this.values = new Map()
    this.handlers = new Map()
    this.settingsSpecs = new Map()
    this.pluginSettings = new Map()
    this.widgetSequence = 0
    this.errors = []
    this.booted = false
  }

  get memory() {
    return this.memoryFile.data
  }

  get pointer() {
    return this.pointerFile.data
  }

  get settings() {
    return this.settingsFile.data
  }

  async boot({ seed = true } = {}) {
    if (seed) await seedBundledFiles(this.host)
    await Promise.all([
      this.memoryFile.load(),
      this.pointerFile.load(),
      this.settingsFile.load()
    ])
    await this.refreshPlugins()
    await this.startWatchdogs()
    for (const pluginId of this.memory['start-subscription-list'] || []) {
      if (this.isPluginEnabled(pluginId)) await this.startService(pluginId)
    }
    this.booted = true
    this.emit('boot', {
      launcher: this.memory.louncher,
      manager: this.memory['package-manager']
    })
    return this
  }

  async refreshPlugins() {
    const entries = await this.host.list('plugins')
    this.plugins.clear()
    this.pluginSettings.clear()
    for (const entry of entries) {
      if (entry.type !== 'dir') continue
      try {
        const manifest = JSON.parse(await this.host.readText(`plugins/${entry.name}/manifest.json`))
        const id = manifest.name || manifest.id
        if (id !== entry.name) continue
        this.plugins.set(id, { id, manifest })
        this.pluginSettings.set(
          id,
          await this.readJson(`plugins/${id}/settings/settings.json`, {
            enabled: true,
            values: {}
          })
        )
      } catch (error) {
        this.errors.push(`plugin ${entry.name}: ${error.message}`)
      }
    }
    this.emit('plugins', [...this.plugins.values()])
    return [...this.plugins.values()]
  }

  async readJson(path, fallback) {
    try {
      return JSON.parse(await this.host.readText(safePath(path)))
    } catch {
      return structuredClone(fallback)
    }
  }

  async loadModule(path, cache = new Map(), loading = new Set()) {
    const target = safePath(path)
    const url = await this.host.moduleUrl?.(target)
    if (url) return import(url)
    return import(await bundleModule(this.host, target, cache, loading))
  }

  serviceKey(pluginId, name) {
    const entry = this.plugins.get(pluginId)?.manifest?.entry?.service?.path || `services/${name}.js`
    return `${pluginId}:${entry}`
  }

  async startService(pluginId, name = 'main') {
    const id = this.serviceKey(pluginId, name)
    if (this.services.has(id)) return this.services.get(id)
    const plugin = this.plugins.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    const entry = plugin.manifest.entry?.service?.path || `services/${name}.js`
    const module = await this.loadModule(`plugins/${pluginId}/${entry}`)
    if (!this.services.has(id)) {
      const record = { id, module, context: this.createContext(pluginId) }
      this.services.set(id, record)
      try {
        await module.main?.(record.context)
      } catch (error) {
        this.services.delete(id)
        throw error
      }
    }
    return this.services.get(id)
  }

  async startWatchdogs() {
    for (const [watchKey, target] of Object.entries(this.memory.watchdogs || {})) {
      const [pluginId, watchName] = watchKey.split(':')
      const [targetPlugin, serviceName] = String(target).split('.')
      if (!pluginId || !watchName || !targetPlugin || !serviceName) continue
      try {
        const entry = this.plugins.get(pluginId)?.manifest?.entry?.watchdog?.path
        const path = `plugins/${pluginId}/${entry || `wachdogs/${watchName}.js`}`
        const module = await this.loadModule(path)
        const context = this.createWatchdogContext(pluginId, target)
        const stop = await module.watch?.(context)
        this.watchdogs.push({ key: watchKey, target, stop })
      } catch (error) {
        this.errors.push(`watchdog ${watchKey}: ${error.message}`)
      }
    }
  }

  createContext(pluginId) {
    const kernel = this
    return {
      plugin: pluginId,
      kernel,
      get: (key) => kernel.values.get(key),
      set: async (key, value) => {
        kernel.values.set(key, value)
        kernel.emit(`memory:${key}`, value)
        return value
      },
      setShared: (patch) => kernel.memoryFile.patch(patch),
      subscribe: (topic, handler) => kernel.on(`memory:${topic}`, handler),
      widget: (payload) => kernel.sendWidget({ ...payload, plugin: pluginId }),
      updateWidget: (widId, payload) => kernel.updateWidget(widId, payload),
      settings: {
        values: async () => (await kernel.getPluginSettings(pluginId)).values,
        save: (values) => kernel.savePluginSettings(pluginId, values)
      },
      log: (...args) => console.log(`[${pluginId}]`, ...args)
    }
  }

  createWatchdogContext(pluginId, target) {
    const context = this.createContext(pluginId)
    const [targetPlugin, serviceName] = target.split('.')
    return {
      ...context,
      target,
      notifyService: async (payload) => {
        const record =
          this.services.get(this.serviceKey(targetPlugin, serviceName)) ||
          (await this.startService(targetPlugin, serviceName))
        return record.module.onWatchdog?.(payload, record.context)
      }
    }
  }

  async publish(key, value) {
    this.values.set(key, value)
    this.emit(`memory:${key}`, value)
    return value
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event).add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  emit(event, detail) {
    for (const handler of this.handlers.get(event) || []) handler(detail)
  }

  resolveProvider(wid) {
    return this.pointer.widgets?.[wid] || 'default'
  }

  sendWidget(payload) {
    if (payload.wid_id && this.widgets.some((widget) => widget.wid_id === payload.wid_id)) {
      return this.updateWidget(payload.wid_id, payload)
    }
    this.widgetSequence += 1
    const widId = payload.wid_id || `wid-${this.widgetSequence}-${Date.now().toString(36)}`
    const widget = {
      ...structuredClone(payload),
      wid_id: widId,
      plugin: payload.plugin || this.resolveProvider(payload.wid)
    }
    this.widgets.push(widget)
    this.emit('widget', { type: 'create', widget })
    return { wid_id: widId }
  }

  updateWidget(widId, payload) {
    const index = this.widgets.findIndex((widget) => widget.wid_id === widId)
    if (index < 0) return this.sendWidget({ ...payload, wid_id: widId })
    const widget = {
      ...this.widgets[index],
      ...structuredClone(payload),
      wid_id: widId
    }
    this.widgets[index] = widget
    this.emit('widget', { type: 'update', widget })
    return { wid_id: widId }
  }

  onWidget(handler) {
    return this.on('widget', handler)
  }

  waitForFeed(timeout = 3000) {
    const expected = (this.memory['feed-subscription-list'] || []).filter((id) =>
      this.isPluginEnabled(id)
    )
    const ready = () => expected.every((id) => this.widgets.some((widget) => widget.plugin === id))
    if (ready()) return Promise.resolve(true)
    return new Promise((resolve) => {
      const stop = this.on('widget', () => {
        if (!ready()) return
        clearTimeout(timer)
        stop()
        resolve(true)
      })
      const timer = setTimeout(() => {
        stop()
        resolve(false)
      }, timeout)
    })
  }

  pluginSettingsPath(pluginId) {
    return safePath(`plugins/${pluginId}/settings/settings.json`)
  }

  isPluginEnabled(pluginId) {
    return this.pluginSettings.get(pluginId)?.enabled !== false
  }

  async getPluginSettings(pluginId) {
    if (!this.settingsSpecs.has(pluginId)) {
      this.settingsSpecs.set(
        pluginId,
        await this.readJson(`plugins/${pluginId}/settings/settings-widget.json`, {
          title: pluginId,
          description: '',
          fields: []
        })
      )
    }
    const spec = this.settingsSpecs.get(pluginId)
    const defaults = Object.fromEntries((spec.fields || []).map((field) => [field.key, field.default]))
    const saved = this.pluginSettings.get(pluginId)?.values || {}
    return { spec, values: { ...defaults, ...saved } }
  }

  async savePluginSettings(pluginId, values) {
    const current = this.pluginSettings.get(pluginId) || { enabled: true, values: {} }
    current.values = { ...values }
    this.pluginSettings.set(pluginId, current)
    await this.host.writeText(this.pluginSettingsPath(pluginId), `${JSON.stringify(current, null, 2)}\n`)
    return current
  }

  async setPluginEnabled(pluginId, enabled) {
    const current = this.pluginSettings.get(pluginId) || { values: {} }
    current.enabled = enabled
    this.pluginSettings.set(pluginId, current)
    await this.host.writeText(this.pluginSettingsPath(pluginId), `${JSON.stringify(current, null, 2)}\n`)
    this.emit('settings', { pluginId, enabled })
  }

  async setTheme(theme) {
    this.settings.theme = { ...this.settings.theme, ...theme }
    await this.settingsFile.save()
    this.emit('theme', this.settings.theme)
  }

  async setMemory(patch) {
    await this.memoryFile.patch(patch)
    this.emit('memory', this.memory)
  }

  providers(role) {
    const defaults = role === 'launcher' ? ['default-louncher'] : ['default-pm']
    const fromPlugins = [...this.plugins.values()]
      .filter((plugin) => {
        const roles = plugin.manifest.subscriptions?.roles || plugin.manifest.provides || []
        return roles.includes(role)
      })
      .map((plugin) => plugin.id)
    return [...new Set([...defaults, ...fromPlugins])]
  }

  isInfrastructurePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId)
    const roles = plugin?.manifest?.subscriptions?.roles || plugin?.manifest?.provides || []
    return (
      roles.includes('launcher') ||
      roles.includes('plugin-manager') ||
      pluginId === this.memory.louncher ||
      pluginId === this.memory['package-manager']
    )
  }

  async removePlugin(pluginId) {
    if (!this.plugins.has(pluginId)) return false
    if (pluginId === this.memory.louncher || pluginId === this.memory['package-manager']) {
      this.errors.push(`cannot remove active role provider ${pluginId}`)
      return false
    }
    await this.host.remove(`plugins/${pluginId}`)
    this.plugins.delete(pluginId)
    for (const [key, record] of this.services) {
      if (key.startsWith(`${pluginId}.`)) this.services.delete(key)
    }
    this.watchdogs = this.watchdogs.filter((watchdog) => !watchdog.key.startsWith(`${pluginId}:`))
    for (const key of ['start-subscription-list', 'feed-subscription-list']) {
      this.memory[key] = (this.memory[key] || []).filter((id) => id !== pluginId)
    }
    for (const [wid, provider] of Object.entries(this.pointer.widgets || {})) {
      if (provider === pluginId) delete this.pointer.widgets[wid]
    }
    for (const [service, provider] of Object.entries(this.pointer.services || {})) {
      if (provider === pluginId) delete this.pointer.services[service]
    }
    for (const [key, target] of Object.entries(this.memory.watchdogs || {})) {
      if (key.startsWith(`${pluginId}:`) || target.startsWith(`${pluginId}.`)) {
        delete this.memory.watchdogs[key]
      }
    }
    this.pluginSettings.delete(pluginId)
    this.settingsSpecs.delete(pluginId)
    await Promise.all([
      this.memoryFile.save(),
      this.pointerFile.save(),
      this.settingsFile.save()
    ])
    this.emit('plugins', [...this.plugins.values()])
    return true
  }
}
