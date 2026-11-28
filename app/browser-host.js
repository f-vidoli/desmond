const PREFIX = 'desmond:file:'
const BINARY = 'desmond:bytes:'

function key(path) {
  return PREFIX + normalize(path)
}

function binaryKey(path) {
  return BINARY + normalize(path)
}

function normalize(path) {
  return String(path).replace(/^\/+/, '').replace(/\/{2,}/g, '/')
}

function parentOf(path) {
  const parts = normalize(path).split('/')
  parts.pop()
  return parts.join('/')
}

function nameOf(path) {
  return normalize(path).split('/').pop()
}

function toBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export class BrowserHost {
  async readText(path) {
    const value = localStorage.getItem(key(path))
    if (value === null) throw new Error(`Missing file: ${path}`)
    return value
  }

  async writeText(path, value) {
    localStorage.setItem(key(path), String(value))
  }

  async readBytes(path) {
    const encoded = localStorage.getItem(binaryKey(path))
    if (encoded !== null) return fromBase64(encoded)
    return new TextEncoder().encode(await this.readText(path))
  }

  async writeBytes(path, bytes) {
    localStorage.setItem(binaryKey(path), toBase64(bytes))
  }

  async exists(path) {
    return localStorage.getItem(key(path)) !== null || localStorage.getItem(binaryKey(path)) !== null
  }

  async mkdir() {}

  async list(dir) {
    const prefix = normalize(dir) ? `${normalize(dir)}/` : ''
    const entries = new Map()
    for (let index = 0; index < localStorage.length; index += 1) {
      const stored = localStorage.key(index)
      if (!stored.startsWith(PREFIX) && !stored.startsWith(BINARY)) continue
      const path = stored.slice(stored.startsWith(PREFIX) ? PREFIX.length : BINARY.length)
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (!rest) continue
      const parts = rest.split('/')
      const type = parts.length > 1 ? 'dir' : 'file'
      const name = parts[0]
      if (!entries.has(name) || type === 'file') entries.set(name, { name, type })
    }
    return [...entries.values()]
  }

  async remove(path) {
    const target = normalize(path)
    for (const stored of Object.keys(localStorage)) {
      if (!stored.startsWith(PREFIX) && !stored.startsWith(BINARY)) continue
      const name = stored.slice(stored.startsWith(PREFIX) ? PREFIX.length : BINARY.length)
      if (name === target || name.startsWith(`${target}/`)) localStorage.removeItem(stored)
    }
  }

  async pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.onchange = () => resolve(input.files?.[0] || null)
      input.onerror = () => reject(new Error('File picker failed'))
      input.click()
    })
  }

  async confirm(message) {
    return globalThis.confirm(message)
  }

  async saveFile(name, text) {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function fileParent(path) {
  return parentOf(path)
}

export function fileName(path) {
  return nameOf(path)
}
