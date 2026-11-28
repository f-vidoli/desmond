import { Kernel } from '../kernel.js'
import { createHost } from './host.js'
import { applyTheme } from './palette.js'
import { PluginManager } from './plugin-manager.js'
import { createManagerSettings } from './plugin-manager-ui.js'
import { renderTemplate, renderWidget } from './renderer.js'
import { createSettingsPanel } from './settings-panel.js'

async function loadRole(kernel, pluginId, role, exportName, deps) {
  const plugin = kernel.plugins.get(pluginId)
  if (!plugin) throw new Error(`Missing ${role} plugin: ${pluginId}`)
  const path = plugin.manifest.entry?.[role]?.path || 'services/main.js'
  const module = await kernel.loadModule(`plugins/${pluginId}/${path}`)
  if (!module[exportName]) throw new Error(`${pluginId} does not export ${exportName}`)
  return module[exportName](kernel, deps)
}

async function start() {
  const host = createHost()
  const kernel = new Kernel(host)
  await kernel.boot()
  applyTheme(kernel.settings.theme)

  const deps = {
    PluginManager,
    renderTemplate,
    renderWidget,
    createSettingsPanel,
    createManagerSettings: (kernel, container) => createManagerSettings(kernel, container, deps)
  }

  const launcher = await loadRole(
    kernel,
    kernel.memory.louncher,
    'launcher',
    'createLauncher',
    deps
  )
  await launcher.mount()
  globalThis.desmondApp = { kernel, launcher }
}

start().catch((error) => {
  const root = document.getElementById('app')
  const detail = error?.message || (typeof error === 'string' ? error : JSON.stringify(error))
  root.textContent = `Desmond failed to start: ${detail}`
  console.error(error)
})
