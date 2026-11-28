import assert from 'node:assert/strict'
import test from 'node:test'
import { createZip, readZip, unpackFiles } from '../app/zip.js'

test('zip roundtrip strips a single root folder and keeps file bytes', async () => {
  const bytes = createZip([
    { name: 'my.plugin/manifest.json', bytes: new TextEncoder().encode('{"id":"my.plugin"}') },
    { name: 'my.plugin/widgets/card.html', bytes: new TextEncoder().encode('<p>hello</p>') }
  ])
  const files = await unpackFiles(await readZip(bytes))
  assert.deepEqual(files.map((file) => file.name), ['manifest.json', 'widgets/card.html'])
  assert.equal(new TextDecoder().decode(files[1].bytes), '<p>hello</p>')
})

test('zip rejects traversal paths', () => {
  assert.throws(
    () => createZip([{ name: '../outside.txt', bytes: new TextEncoder().encode('bad') }]),
    /Unsafe ZIP path/
  )
})
