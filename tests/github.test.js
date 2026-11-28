import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGithubLink } from '../app/github.js'

test('normalizes repository links to a main branch archive', () => {
  assert.equal(
    normalizeGithubLink('https://github.com/example/desmond-feedpack'),
    'https://codeload.github.com/example/desmond-feedpack/zip/refs/heads/main'
  )
})

test('uses an explicit ref from a tree link', () => {
  assert.equal(
    normalizeGithubLink('https://github.com/example/desmond-feedpack/tree/dev/widgets'),
    'https://codeload.github.com/example/desmond-feedpack/zip/refs/heads/dev'
  )
})
