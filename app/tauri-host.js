function invoke(command, args = {}) {
  const internals = globalThis.__TAURI_INTERNALS__
  if (!internals) throw new Error('Tauri bridge unavailable')
  return internals.invoke(command, args)
}

export class TauriHost {
  readText(path) {
    return invoke('desmond_read_text', { path })
  }

  writeText(path, value) {
    return invoke('desmond_write_text', { path, value })
  }

  async readBytes(path) {
    const values = await invoke('desmond_read_bytes', { path })
    return new Uint8Array(values)
  }

  writeBytes(path, bytes) {
    return invoke('desmond_write_bytes', { path, bytes: Array.from(bytes) })
  }

  exists(path) {
    return invoke('desmond_exists', { path })
  }

  mkdir(path) {
    return invoke('desmond_mkdir', { path })
  }

  list(path) {
    return invoke('desmond_list', { path })
  }

  remove(path) {
    return invoke('desmond_remove', { path })
  }

  moduleUrl(path) {
    return invoke('desmond_module_url', { path })
  }

  pickFile() {
    return invoke('desmond_pick_file')
  }

  confirm(message) {
    return invoke('desmond_confirm', { message })
  }

  saveFile(name, text) {
    return invoke('desmond_save_file', { name, text })
  }
}
