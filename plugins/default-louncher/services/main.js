export async function createLauncher(kernel, deps) {
  const existingTheme = document.getElementById('desmond-theme')
  if (existingTheme) existingTheme.remove()
  const theme = document.createElement('style')
  theme.id = 'desmond-theme'
  theme.textContent = await kernel.host.readText('plugins/default-louncher/services/theme.css')
  document.head.append(theme)

  const root = document.getElementById('app')
  root.innerHTML = `
    <header class="topbar">
      <div class="brand-block">
        <span class="brand-kicker">kernel console</span>
        <div class="brand">Desmond</div>
      </div>
      <nav class="tabs" aria-label="Screens">
        <button type="button" data-screen="feed">Feed</button>
        <button type="button" data-screen="settings">Settings</button>
      </nav>
      <span class="build-mark">[ local / v0.1 ]</span>
    </header>
    <main class="screen-host">
      <div class="feed-rail" aria-hidden="true"><span>signal</span></div>
      <section class="screen" data-screen-body="feed"></section>
      <section class="screen" data-screen-body="settings" hidden>
        <div class="settings-grid">
          <div class="settings-manager"></div>
          <div class="settings-main"></div>
        </div>
      </section>
    </main>
  `

  const feed = root.querySelector('[data-screen-body="feed"]')
  const settings = root.querySelector('[data-screen-body="settings"]')
  const tabs = [...root.querySelectorAll('.tabs button')]
  let generation = 0

  const refreshFeed = async () => {
    const current = ++generation
    const nodes = []
    for (const widget of kernel.widgets) {
      nodes.push(await deps.renderWidget(kernel.host, widget, kernel.pointer))
    }
    if (current !== generation) return
    if (nodes.length) {
      feed.replaceChildren(...nodes)
    } else {
      const empty = document.createElement('p')
      empty.className = 'empty-feed'
      empty.textContent = 'No widgets yet. Waiting for subscribed plugins.'
      feed.replaceChildren(empty)
    }
  }

  feed.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="refresh-feed"]')) {
      kernel.publish('rss:tick', Date.now())
    }
  })

  for (const tab of tabs) {
    tab.onclick = () => {
      const target = tab.dataset.screen
      for (const other of tabs) other.classList.toggle('active', other === tab)
      feed.hidden = target !== 'feed'
      settings.hidden = target !== 'settings'
    }
  }
  tabs[0].classList.add('active')

  await deps.createSettingsPanel(kernel, settings.querySelector('.settings-main'))
  await deps.createManagerSettings(kernel, settings.querySelector('.settings-manager'), deps)

  kernel.onWidget(refreshFeed)
  kernel.on('plugins', refreshFeed)
  await refreshFeed()

  return {
    mount: async () => {
      await kernel.waitForFeed()
      await refreshFeed()
    },
    refreshFeed,
    show: (screen) => tabs.find((tab) => tab.dataset.screen === screen)?.click()
  }
}
