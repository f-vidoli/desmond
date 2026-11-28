async function fileBytes(file) {
  if (!file) throw new Error('No file selected')
  if (file.arrayBuffer) return new Uint8Array(await file.arrayBuffer())
  if (file.bytes) return new Uint8Array(file.bytes)
  throw new Error('Unsupported file from host')
}

async function fileText(file) {
  if (!file) throw new Error('No file selected')
  if (file.text) return file.text()
  return new TextDecoder().decode(await fileBytes(file))
}

export async function createManagerSettings(kernel, container, deps) {
  const manager = new deps.PluginManager(kernel)
  const host = kernel.host
  const section = await deps.renderTemplate(host, 'plugin-manager', {
    title: 'Plugin manager',
    status: 'Ready',
    message: 'Install from GitHub, a ZIP, or a plugin bundle.'
  })
  const installed = document.createElement('div')
  installed.className = 'installed-plugins'
  container.append(section, installed)
  const message = section.querySelector('[data-slot="message"]')
  const report = (text) => {
    message.textContent = text
  }
  const run = async (action) => {
    try {
      report('Working…')
      const result = await action()
      report(result || 'Done')
    } catch (error) {
      report(`Error: ${error.message}`)
    }
  }

  section.querySelector('[data-action="install-github"]').onclick = () =>
    run(async () => {
      const url = section.querySelector('[data-field="github"]').value.trim()
      if (!url) throw new Error('Enter a GitHub link')
      const ids = await manager.installUrl(url)
      return `Installed ${ids.join(', ')}`
    })

  section.querySelector('[data-action="install-zip"]').onclick = () =>
    run(async () => {
      const file = await host.pickFile()
      const ids = await manager.installZip(await fileBytes(file))
      return `Installed ${ids.join(', ')}`
    })

  section.querySelector('[data-action="import"]').onclick = () =>
    run(async () => {
      const file = await host.pickFile()
      const ids = await manager.importBundle(await fileText(file))
      return `Imported ${ids.join(', ')}`
    })

  section.querySelector('[data-action="export"]').onclick = () =>
    run(async () => {
      await host.saveFile('desmond-plugins.json', await manager.exportBundle())
      return 'Plugin bundle exported'
    })

  const refresh = () => {
    installed.replaceChildren()
    const title = document.createElement('h3')
    title.textContent = 'Installed plugins'
    installed.append(title)
    for (const plugin of kernel.plugins.values()) {
      if (kernel.isInfrastructurePlugin(plugin.id)) continue
      const row = document.createElement('div')
      row.className = 'installed-row'
      row.textContent = `${plugin.manifest.name || plugin.id} · ${plugin.manifest.version || ''}`
      installed.append(row)
    }
  }
  refresh()
  kernel.on('plugins', refresh)
  return { refresh }
}
