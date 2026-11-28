# Desmond

A microkernel-style plugin desktop and mobile app. The web core is platform agnostic: it only talks to a small host adapter, so the same `kernel.js`, plugins, and HTML widgets run under Electron and Tauri.

## Structure

```text
kernel.js                 kernel: shared memory, pointer, services, watchdogs, widgets
shared_memory.json        louncher, package-manager, subscription lists, watchdogs
plugin_pointer.json       widget/service name -> plugin
settings.json             selected theme mode/principal; plugin settings live under plugins/<id>/settings/
seed-manifest.json        first-run seed and cleanup of bundled files
index.html                web entry point
app/                      bootstrap, renderer, settings panel, host adapters
plugins/default-louncher  default launcher plugin
plugins/default-pm        default plugin manager plugin
plugins/default-widgets   default HTML widget templates
electron/                 desktop shell for the web core
src-tauri/                Tauri shell for desktop and mobile builds
tests/                    node:test suite
```

Every `defoult` name from the original draft is spelled `default`.

Every folder under `plugins/` uses the same shape:

```text
plugins/<id>/
  manifest.json
  services/main.js       and any files it needs
  widgets/               HTML widget files
  settings/settings-widget.json
  settings/settings.json
  wachdogs/              .js files called by the kernel watchdog manager
```

## Boot and feed

1. The kernel seeds the JSON files and plugin folders on first run.
2. It reads `louncher` from `shared_memory.json` and loads that launcher plugin; the default launcher shows Feed and Settings.
3. Plugins listed in `start-subscription-list` run `services/main.js`.
4. Plugins listed in `feed-subscription-list` send a widget payload:

```json
{
  "wid": "feed",
  "content": { "title": "Example feed" },
  "hierarchy": [{ "tag": "ul", "children": [{ "tag": "li", "text": "Item" }] }]
}
```

`wid` is resolved through `plugin_pointer.json` to a plugin widget template. A new widget gets a `wid_id` back from the kernel; sending that `wid_id` later updates the same widget instead of creating another.

## Settings

Plugin settings come from `plugins/<id>/settings/settings-widget.json`, and saved values plus the on/off state are written to `plugins/<id>/settings/settings.json`. Each subscribed plugin renders with an on/off switch, save action, and a delete action with a confirmation dialog. The launcher settings also control dark/light theme and named principal palettes defined in `plugins/default-louncher/services/theme.css`; editing that one CSS file changes the whole app theme.

## Plugin manager

Installs from a GitHub link or a ZIP, and can import/export plugin bundles as JSON. A plugin manifest uses `name`, `version`, `subscriptions`, `dependencies`, `widgets`, and `settings`; the `subscriptions` object holds `start`, `feed`, `wachdogs`, `plugin_pointer`, and `settings`. The manager registers these in `plugin_pointer.json` and `shared_memory.json`. Watchdog entries are written as `"a:b": "a.b"`: `a:b` loads `plugins/a/wachdogs/b.js`, and `a.b` loads `plugins/a/services/b.js`.

## Host adapters

The core uses only `readText`, `writeText`, `readBytes`, `writeBytes`, `exists`, `mkdir`, `list`, `remove`, `pickFile`, `saveFile`, and `confirm`. `app/browser-host.js` handles browsers and development; `app/electron-host.js` forwards to the Electron shell; `app/tauri-host.js` forwards to the Tauri Rust commands. No Node or Rust API is imported by the kernel.

On Android, file picker and confirmation commands are no-ops; plugin storage still works in the app data directory.

## Commands

```bash
npm install
npm start
npm test
npm run build:web
npm run tauri
```

## License

MIT. See [LICENSE](LICENSE).
