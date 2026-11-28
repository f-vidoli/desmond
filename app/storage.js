export class JsonFile {
  constructor(host, path, fallback = {}) {
    this.host = host
    this.path = path
    this.fallback = fallback
    this.data = structuredClone(fallback)
    this.pending = Promise.resolve()
  }

  async load() {
    try {
      this.data = JSON.parse(await this.host.readText(this.path))
    } catch {
      this.data = structuredClone(this.fallback)
      await this.save()
    }
    return this.data
  }

  save() {
    this.pending = this.pending.then(() =>
      this.host.writeText(this.path, `${JSON.stringify(this.data, null, 2)}\n`)
    )
    return this.pending
  }

  async patch(patch) {
    Object.assign(this.data, patch)
    await this.save()
    return this.data
  }
}

async function readBundled(host, path) {
  if (host.readBundled) return host.readBundled(path)
  const base = globalThis.location?.href || 'file:///'
  const response = await fetch(new URL(path, base))
  if (!response.ok) throw new Error(`Cannot read bundled file: ${path}`)
  return response.text()
}

export async function seedBundledFiles(host) {
  let manifest
  try {
    manifest = JSON.parse(await readBundled(host, 'seed-manifest.json'))
  } catch {
    return false
  }
  const seeded = await host.readText('system:seed-version').catch(() => '0')
  if (seeded === String(manifest.version)) return false
  for (const path of manifest.remove || []) await host.remove(path)
  for (const path of manifest.files) {
    if (!(manifest.overwrite || []).includes(path) && (await host.exists(path))) continue
    await host.writeText(path, await readBundled(host, path))
  }
  await host.writeText('system:seed-version', String(manifest.version))
  return true
}
