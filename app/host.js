import { BrowserHost } from './browser-host.js'
import { ElectronHost } from './electron-host.js'
import { TauriHost } from './tauri-host.js'

export function createHost() {
  if (globalThis.desmondHost) return new ElectronHost(globalThis.desmondHost)
  if (globalThis.__TAURI_INTERNALS__) return new TauriHost()
  return new BrowserHost()
}
