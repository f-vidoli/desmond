import assert from 'node:assert/strict'
import test from 'node:test'
import { Kernel } from '../kernel.js'
import { MemoryHost } from './memory-host.js'

function fixture() {
  const host = new MemoryHost({
    'shared_memory.json': JSON.stringify({
      louncher: 'default-louncher',
      'package-manager': 'default-pm',
      'start-subscription-list': ['test-plugin'],
      'feed-subscription-list': ['test-plugin'],
      watchdogs: { 'test-plugin:on_rss_news': 'test-plugin.on_rss_news' }
    }),
    'plugin_pointer.json': JSON.stringify({
      widgets: { horizontal_scroll: 'test-plugin' },
      services: { rss_resolver: 'test-plugin' }
    }),
    'settings.json': JSON.stringify({ theme: { mode: 'dark' } }),
    'plugins/test-plugin/manifest.json': JSON.stringify({
      name: 'test-plugin',
      version: '3.1',
      subscriptions: {
        start: ['test-plugin'],
        feed: ['test-plugin'],
        wachdogs: { 'test-plugin:on_rss_news': 'test-plugin.on_rss_news' },
        plugin_pointer: {
          widgets: { horizontal_scroll: 'test-plugin' },
          services: { rss_resolver: 'test-plugin' }
        },
        settings: true
      },
      dependencies: [],
      widgets: ['horizontal_scroll'],
      settings: true
    }),
    'plugins/test-plugin/settings/settings-widget.json': JSON.stringify({
      title: 'Test plugin',
      fields: [{ key: 'source', type: 'text', default: 'local' }]
    }),
    'plugins/test-plugin/settings/settings.json': JSON.stringify({
      enabled: true,
      values: { source: 'local' }
    })
  })
  const kernel = new Kernel(host)
  kernel.loadModule = async (path) => modules[path]
  return { kernel, host }
}

const modules = {
  'plugins/test-plugin/services/main.js': {
    async main(ctx) {
      const result = await ctx.widget({ wid: 'horizontal_scroll', content: { title: 'One' } })
      await ctx.set('widget:test', result.wid_id)
    }
  },
  'plugins/test-plugin/services/on_rss_news.js': {
    async onWatchdog(payload, ctx) {
      const widId = ctx.get('widget:test')
      await ctx.updateWidget(widId, { content: { title: payload.source } })
    }
  },
  'plugins/test-plugin/wachdogs/on_rss_news.js': {
    async watch(ctx) {
      return ctx.subscribe('rss:tick', () => ctx.notifyService({ source: 'Two' }))
    }
  }
}

test('boot resolves launcher, starts services and allocates widget ids', async () => {
  const { kernel } = fixture()
  await kernel.boot({ seed: false })
  assert.equal(kernel.memory.louncher, 'default-louncher')
  assert.equal(kernel.widgets.length, 1)
  assert.equal(kernel.widgets[0].plugin, 'test-plugin')
  assert.ok(kernel.widgets[0].wid_id.startsWith('wid-'))
  assert.equal(await kernel.waitForFeed(), true)
})

test('an existing wid_id updates the widget instead of creating a new one', async () => {
  const { kernel } = fixture()
  await kernel.boot({ seed: false })
  const widId = kernel.widgets[0].wid_id
  const result = kernel.updateWidget(widId, { content: { title: 'Updated' } })
  assert.deepEqual(result, { wid_id: widId })
  assert.equal(kernel.widgets.length, 1)
  assert.equal(kernel.widgets[0].content.title, 'Updated')
})

test('watchdogs notify the mapped service through shared memory', async () => {
  const { kernel } = fixture()
  await kernel.boot({ seed: false })
  await kernel.publish('rss:tick', Date.now())
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(kernel.widgets[0].content.title, 'Two')
})

test('plugin settings and theme are persisted to their settings files', async () => {
  const { kernel, host } = fixture()
  await kernel.boot({ seed: false })
  const settings = await kernel.getPluginSettings('test-plugin')
  assert.equal(settings.values.source, 'local')
  await kernel.savePluginSettings('test-plugin', { source: 'remote' })
  await kernel.setPluginEnabled('test-plugin', false)
  await kernel.setTheme({ mode: 'light', principal: 'phosphor' })
  const pluginSettings = JSON.parse(
    await host.readText('plugins/test-plugin/settings/settings.json')
  )
  const saved = JSON.parse(await host.readText('settings.json'))
  assert.equal(pluginSettings.values.source, 'remote')
  assert.equal(pluginSettings.enabled, false)
  assert.equal(saved.theme.principal, 'phosphor')
})

test('removing a plugin clears its subscriptions and pointer entries', async () => {
  const { kernel } = fixture()
  await kernel.boot({ seed: false })
  assert.equal(await kernel.removePlugin('test-plugin'), true)
  assert.deepEqual(kernel.memory['start-subscription-list'], [])
  assert.deepEqual(kernel.memory['feed-subscription-list'], [])
  assert.deepEqual(kernel.pointer.widgets, {})
  assert.deepEqual(kernel.memory.watchdogs, {})
})

test('active role providers cannot be removed', async () => {
  const { kernel } = fixture()
  await kernel.boot({ seed: false })
  kernel.memory.louncher = 'test-plugin'
  assert.equal(await kernel.removePlugin('test-plugin'), false)
  assert.equal(kernel.plugins.has('test-plugin'), true)
})

test('launcher and manager plugins are marked as infrastructure', async () => {
  const { kernel } = fixture()
  await kernel.boot({ seed: false })
  assert.equal(kernel.isInfrastructurePlugin('default-louncher'), true)
  assert.equal(kernel.isInfrastructurePlugin('default-pm'), true)
  assert.equal(kernel.isInfrastructurePlugin('test-plugin'), false)
})

test('loadModule inlines relative imports when the host has no module URL', async () => {
  const host = new MemoryHost({
    'plugins/test-plugin/services/feed-items.js': 'export const label = "bundled"',
    'plugins/test-plugin/services/main.js':
      'import { label } from "./feed-items.js"; export async function main() { return label }'
  })
  const kernel = new Kernel(host)
  const module = await kernel.loadModule('plugins/test-plugin/services/main.js')
  assert.equal(await module.main(), 'bundled')
})

test('loadModule awaits an async moduleUrl from the host', async () => {
  const host = new MemoryHost({})
  let requested = ''
  host.moduleUrl = async (path) => {
    requested = path
    return 'data:text/javascript,export const ok = true'
  }
  const kernel = new Kernel(host)
  const module = await kernel.loadModule('plugins/test-plugin/services/main.js')
  assert.equal(requested, 'plugins/test-plugin/services/main.js')
  assert.equal(module.ok, true)
})
