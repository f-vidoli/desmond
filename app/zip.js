const DECODER = new TextDecoder()
const MAX_ENTRIES = 500
const MAX_ENTRY_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 32 * 1024 * 1024

function findEnd(view) {
  const start = Math.max(0, view.byteLength - 65557)
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  throw new Error('Invalid ZIP: end record not found')
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    if (bytes.length) throw new Error('ZIP compression is not supported on this platform')
    return bytes
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function safeName(name) {
  const clean = name.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean || clean.endsWith('/') || clean.split('/').includes('..')) return null
  return clean
}

export async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = findEnd(view)
  const count = view.getUint16(end + 10, true)
  if (!count || count > MAX_ENTRIES) throw new Error('Invalid ZIP entry count')
  let offset = view.getUint32(end + 16, true)
  const entries = []
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid ZIP central directory')
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const name = DECODER.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    if (size > MAX_ENTRY_BYTES) throw new Error('ZIP entry too large')
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('Invalid ZIP local header')
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize)
    entries.push({ name, size, method, bytes: compressed })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export async function unpackFiles(entries) {
  const files = []
  let total = 0
  for (const entry of entries) {
    const name = safeName(entry.name)
    if (!name) continue
    const data = entry.method === 8 ? await inflateRaw(entry.bytes) : entry.bytes
    total += data.byteLength
    if (total > MAX_TOTAL_BYTES) throw new Error('ZIP payload too large')
    files.push({ name, bytes: data })
  }
  const roots = new Set(files.map((file) => file.name.split('/')[0]))
  const strip = roots.size === 1 && !files.some((file) => !file.name.includes('/')) ? `${[...roots][0]}/` : ''
  return files.map((file) => ({
    name: strip ? file.name.slice(strip.length) : file.name,
    bytes: file.bytes
  }))
}

function crc32(bytes) {
  let table = crc32.table
  if (!table) {
    table = new Uint32Array(256)
    for (let index = 0; index < 256; index += 1) {
      let value = index
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
      table[index] = value >>> 0
    }
    crc32.table = table
  }
  let crc = 0xffffffff
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const ENCODER = new TextEncoder()

export function createZip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const file of files) {
    const safe = safeName(file.name)
    if (!safe) throw new Error(`Unsafe ZIP path: ${file.name}`)
    const name = ENCODER.encode(safe)
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : ENCODER.encode(String(file.bytes))
    const checksum = crc32(bytes)
    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, bytes.length, true)
    localView.setUint32(22, bytes.length, true)
    localView.setUint16(26, name.length, true)
    local.set(name, 30)
    localParts.push(local, bytes)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, bytes.length, true)
    centralView.setUint32(24, bytes.length, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint32(42, offset, true)
    central.set(name, 46)
    centralParts.push(central)
    offset += local.length + bytes.length
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  const parts = [...localParts, ...centralParts, end]
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let cursor = 0
  for (const part of parts) {
    output.set(part, cursor)
    cursor += part.length
  }
  return output
}
