import { applyTheme, PRINCIPALS, principalVar } from './palette.js'
import { renderTemplate } from './renderer.js'

function fieldInput(field, value) {
  const label = document.createElement('label')
  label.className = 'settings-field'
  const input = document.createElement('input')
  if (field.type === 'boolean') {
    input.type = 'checkbox'
    input.checked = Boolean(value)
  } else {
    input.type = field.type === 'number' ? 'number' : 'text'
    input.value = value ?? ''
  }
  input.dataset.key = field.key
  const caption = document.createElement('span')
  caption.textContent = field.label || field.key
  label.append(caption, input)
  return label
}

export async function createSettingsPanel(kernel, container) {
  const host = kernel.host
  const themeBox = document.createElement('section')
  themeBox.className = 'settings-box'
  themeBox.innerHTML = '<h2>Appearance</h2>'
  const mode = document.createElement('label')
  mode.className = 'settings-field'
  const modeCaption = document.createElement('span')
  modeCaption.textContent = 'Theme'
  const modeSelect = document.createElement('select')
  for (const value of ['dark', 'light']) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value
    modeSelect.append(option)
  }
  modeSelect.value = kernel.settings.theme?.mode || 'dark'
  modeSelect.onchange = async () => {
    await kernel.setTheme({ mode: modeSelect.value })
    applyTheme(kernel.settings.theme)
  }
  mode.append(modeCaption, modeSelect)

  const colors = document.createElement('div')
  colors.className = 'color-row'
  for (const principal of PRINCIPALS) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'color-swatch'
    swatch.dataset.principal = principal
    swatch.style.background = principalVar(principal)
    swatch.title = principal
    swatch.setAttribute('aria-label', `Principal theme ${principal}`)
    swatch.classList.toggle('selected', principal === (kernel.settings.theme?.principal || 'amber'))
    swatch.onclick = async () => {
      await kernel.setTheme({ principal })
      for (const other of colors.children) other.classList.toggle('selected', other === swatch)
      applyTheme(kernel.settings.theme)
    }
    colors.append(swatch)
  }
  themeBox.append(mode, colors)

  const pluginsBox = document.createElement('section')
  pluginsBox.className = 'settings-box'
  pluginsBox.innerHTML = '<h2>Plugins</h2>'

  container.append(themeBox, pluginsBox)

  async function refresh() {
    pluginsBox.replaceChildren()
    for (const plugin of kernel.plugins.values()) {
      const manifest = plugin.manifest
      const roles = manifest.subscriptions?.roles || manifest.provides || []
      if (kernel.isInfrastructurePlugin(plugin.id)) continue
      if (!manifest.settings && !manifest.subscriptions?.settings && !roles.includes('settings')) continue
      const { spec, values } = await kernel.getPluginSettings(plugin.id)
      const enabled = kernel.isPluginEnabled(plugin.id)
      const section = await renderTemplate(host, 'plugin-settings', {
        plugin: plugin.id,
        title: spec.title || manifest.name || plugin.id,
        description: spec.description || ''
      })
      section.querySelector('[data-role="enabled"]').checked = enabled
      const fields = section.querySelector('[data-slot="fields"]')
      for (const field of spec.fields || []) fields.append(fieldInput(field, values[field.key]))
      section.querySelector('[data-role="enabled"]').onchange = async (event) => {
        await kernel.setPluginEnabled(plugin.id, event.target.checked)
      }
      section.querySelector('[data-action="save-plugin-settings"]').onclick = async () => {
        const next = {}
        for (const input of section.querySelectorAll('[data-key]')) {
          if (input.type === 'checkbox') next[input.dataset.key] = input.checked
          else if (input.type === 'number') next[input.dataset.key] = Number(input.value)
          else next[input.dataset.key] = input.value
        }
        await kernel.savePluginSettings(plugin.id, next)
        kernel.values.set('settings:changed', plugin.id)
        kernel.emit('memory:settings:changed', plugin.id)
      }
      const deleteButton = section.querySelector('[data-action="delete-plugin"]')
      const activeRole =
        plugin.id === kernel.memory.louncher ||
        plugin.id === kernel.memory['package-manager']
      if (activeRole) {
        deleteButton.remove()
      } else {
        deleteButton.onclick = async () => {
          const confirmed = await host.confirm(`Delete plugin ${plugin.id}?`)
          if (!confirmed) return
          await kernel.removePlugin(plugin.id)
          refresh()
        }
      }
      pluginsBox.append(section)
    }
  }

  await refresh()
  kernel.on('plugins', refresh)
  kernel.on('settings', refresh)
  return { refresh }
}
