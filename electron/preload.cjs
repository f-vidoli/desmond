const { contextBridge, ipcRenderer } = require('electron')

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('desmondHost', {
  readText: (path) => call('desmond:readText', path),
  readBundled: (path) => call('desmond:readBundled', path),
  writeText: (path, value) => call('desmond:writeText', path, value),
  readBytes: (path) => call('desmond:readBytes', path),
  writeBytes: (path, bytes) => call('desmond:writeBytes', path, bytes),
  exists: (path) => call('desmond:exists', path),
  mkdir: (path) => call('desmond:mkdir', path),
  list: (path) => call('desmond:list', path),
  remove: (path) => call('desmond:remove', path),
  moduleUrl: (path) => call('desmond:moduleUrl', path),
  pickFile: () => call('desmond:pickFile'),
  saveFile: (name, text) => call('desmond:saveFile', name, text),
  confirm: (message) => call('desmond:confirm', message)
})
