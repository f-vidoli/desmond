export function normalizeGithubLink(input) {
  const url = new URL(String(input).trim())
  if (!/(^|\.)github\.com$/i.test(url.hostname)) throw new Error('Only GitHub links are supported')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('Expected a GitHub repository link')
  const [owner, repo] = parts
  const cleanRepo = repo.replace(/\.git$/i, '')
  let ref = ''
  if (parts[2] === 'tree' && parts[3]) ref = parts[3]
  if (parts[2] === 'blob' && parts[3]) ref = parts[3]
  const encoded = encodeURIComponent(ref || 'main')
  return `https://codeload.github.com/${owner}/${cleanRepo}/zip/refs/heads/${encoded}`
}

export async function downloadBytes(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function downloadGithubZip(input) {
  const url = normalizeGithubLink(input)
  try {
    return await downloadBytes(url)
  } catch (error) {
    if (!url.endsWith('/main') || !/404/.test(error.message)) throw error
    return downloadBytes(url.replace(/\/main$/, '/master'))
  }
}
