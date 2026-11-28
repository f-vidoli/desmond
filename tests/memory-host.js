export class MemoryHost {
  constructor(files = {}) {
    this.files = new Map(Object.entries(files))
  }

  async readText(path) {
    if (!this.files.has(path)) throw new Error(`Missing file: ${path}`)
    return this.files.get(path)
  }

  async writeText(path, value) {
    this.files.set(path, String(value))
  }

  async readBytes(path) {
    return new TextEncoder().encode(await this.readText(path))
  }

  async writeBytes(path, bytes) {
    this.files.set(path, new TextDecoder().decode(bytes))
  }

  async exists(path) {
    return this.files.has(path)
  }

  async mkdir() {}

  async list(dir) {
    const prefix = dir ? `${dir}/` : ''
    const names = new Map()
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (!rest) continue
      const parts = rest.split('/')
      names.set(parts[0], { name: parts[0], type: parts.length > 1 ? 'dir' : 'file' })
    }
    return [...names.values()]
  }

  async remove(path) {
    for (const stored of [...this.files.keys()]) {
      if (stored === path || stored.startsWith(`${path}/`)) this.files.delete(stored)
    }
  }

  async confirm() {
    return true
  }
}
