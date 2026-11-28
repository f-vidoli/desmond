const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
let dataDir

function resolveInside(base, relative) {
  const target = path.resolve(base, String(relative))
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Path outside allowed directory: ${relative}`)
  }
  return target
}

function dataPath(relative) {
  return resolveInside(dataDir, relative)
}

function assetPath(relative) {
  return resolveInside(root, relative)
}

async function readText(relative, fromAssets = false) {
  return fs.readFile(fromAssets ? assetPath(relative) : dataPath(relative), 'utf8')
}

async function writeText(relative, value) {
  const target = dataPath(relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, String(value), 'utf8')
}

async function readBytes(relative) {
  return Array.from(await fs.readFile(dataPath(relative)))
}

async function writeBytes(relative, bytes) {
  const target = dataPath(relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, Buffer.from(bytes))
}

async function exists(relative) {
  try {
    await fs.access(dataPath(relative))
    return true
  } catch {
    return false
  }
}

async function mkdir(relative) {
  await fs.mkdir(dataPath(relative), { recursive: true })
}

async function list(relative) {
  const target = dataPath(relative)
  const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => [])
  return entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file' }))
}

async function remove(relative) {
  await fs.rm(dataPath(relative), { recursive: true, force: true })
}

function moduleUrl(relative) {
  return pathToFileURL(dataPath(relative)).href
}

async function pickFile() {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] })
  if (result.canceled || !result.filePaths[0]) return null
  const filePath = result.filePaths[0]
  return { name: path.basename(filePath), bytes: Array.from(await fs.readFile(filePath)) }
}

async function saveFile(name, text) {
  const result = await dialog.showSaveDialog({ defaultPath: name })
  if (result.canceled || !result.filePath) return false
  await fs.writeFile(result.filePath, String(text), 'utf8')
  return true
}

async function confirm(message) {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Cancel', 'Delete'],
    defaultId: 0,
    message: String(message)
  })
  return result.response === 1
}

function register() {
  const handlers = {
    'desmond:readText': (_, relative) => readText(relative),
    'desmond:readBundled': (_, relative) => readText(relative, true),
    'desmond:writeText': (_, relative, value) => writeText(relative, value),
    'desmond:readBytes': (_, relative) => readBytes(relative),
    'desmond:writeBytes': (_, relative, bytes) => writeBytes(relative, bytes),
    'desmond:exists': (_, relative) => exists(relative),
    'desmond:mkdir': (_, relative) => mkdir(relative),
    'desmond:list': (_, relative) => list(relative),
    'desmond:remove': (_, relative) => remove(relative),
    'desmond:moduleUrl': (_, relative) => moduleUrl(relative),
    'desmond:pickFile': () => pickFile(),
    'desmond:saveFile': (_, name, text) => saveFile(name, text),
    'desmond:confirm': (_, message) => confirm(message)
  }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler)
  }
}

app.whenReady().then(async () => {
  dataDir = path.join(app.getPath('userData'), 'desmond')
  await fs.mkdir(dataDir, { recursive: true })
  register()
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  await window.loadFile(path.join(root, 'index.html'))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
