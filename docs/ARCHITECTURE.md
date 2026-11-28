# Architecture

## Host boundary

`kernel.js` is plain ES module JavaScript with no platform imports. It receives a host object from `app/host.js`. Electron, Tauri, and the browser each provide the same file/dialog methods. Widget modules are loaded as ES modules from host text, so a plugin does not depend on a filesystem URL scheme.

## Kernel state

- `shared_memory.json`: `louncher`, `package-manager`, `start-subscription-list`, `feed-subscription-list`, `watchdogs`.
- `plugin_pointer.json`: `widgets` and `services` maps from public names to plugin ids.
- `settings.json`: selected launcher theme (`mode`, named `principal`) only.
- `plugins/<id>/settings/settings.json`: per-plugin `enabled` and `values`.

`JsonFile` keeps each document in memory and serializes writes. Runtime topics such as `rss:tick` are non-persistent and delivered through the kernel event bus.

## Plugin folder shape

Every folder in `plugins/` contains `manifest.json` plus four folders:

```text
plugins/<id>/
  manifest.json
  services/main.js
  services/          other files needed by main.js
  widgets/           widget HTML files
  settings/settings-widget.json
  settings/settings.json
  wachdogs/          .js files called by the kernel watchdog manager
```

## Services and watchdogs

`startService(pluginId, name)` resolves `plugins/<id>/services/<name>.js` unless the manifest pins an entry, imports the module, and calls `main(ctx)`. Watchdogs are declared as `"a:b": "a.b"`: the watchdog manager loads `plugins/a/wachdogs/b.js`, then `a.b` calls `onWatchdog(payload, ctx)` from `plugins/a/services/b.js`.

The service context exposes `get`, `set`, `publish`, `subscribe`, `setShared`, `widget`, `updateWidget`, `settings`, `log`, and the kernel reference.

## Widgets

A widget payload contains `wid`, optional `wid_id`, `content`, `hierarchy`, and nested `widgets`. `sendWidget` allocates a `wid_id` when absent; `updateWidget` replaces the record with that id. The renderer resolves the template path through the pointer and fills `{{key}}` placeholders using `textContent`, builds hierarchy nodes from a tag whitelist, and recursively renders nested widgets. Default templates live in `plugins/default-widgets/`; to add a core widget, put its HTML there.

## Roles

`default-louncher`, `default-pm`, and `default-widgets` are ordinary plugins in `plugins/`. `plugins/default-louncher/services/main.js` exports `createLauncher(kernel, deps)`, injects `plugins/default-louncher/services/theme.css`, and owns the Feed/Settings UI; editing that CSS changes the whole app theme;
 `plugins/default-pm/services/main.js` exports `createManagerSettings(kernel, container, deps)` and owns install/import/export UI. `app/main.js` passes the shared utilities explicitly as `deps`; no global factory is used.

## Install pipeline

GitHub links are normalized to codeload ZIP URLs with a `main`/`master` fallback. ZIP entries are parsed in `app/zip.js` with central-directory validation, path sanitization, size limits, and raw DEFLATE decompression. Installed files are written under `plugins/<manifest.name>`, then the plugin manager reads `manifest.subscriptions` to register `start`, `feed`, `wachdogs`, `plugin_pointer`, and `settings`. Bundle import/export uses the same file set encoded as base64 JSON.

## Platform notes

Desktop ships through Electron (`electron/main.cjs`). The Tauri scaffold (`src-tauri/`) mirrors the host commands and can be extended with Android/iOS targets without changing the web core.
