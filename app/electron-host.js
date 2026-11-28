export class ElectronHost {
  constructor(api) {
    this.api = api
  }

  readText(path) {
    return this.api.readText(path)
  }

  readBundled(path) {
    return this.api.readBundled(path)
  }

  writeText(path, value) {
    return this.api.writeText(path, value)
  }

  readBytes(path) {
    return this.api.readBytes(path).then((value) => new Uint8Array(value))
  }

  writeBytes(path, bytes) {
    return this.api.writeBytes(path, Array.from(bytes))
  }

  exists(path) {
    return this.api.exists(path)
  }

  mkdir(path) {
    return this.api.mkdir(path)
  }

  list(path) {
    return this.api.list(path)
  }

  remove(path) {
    return this.api.remove(path)
  }

  moduleUrl(path) {
    return this.api.moduleUrl(path)
  }

  pickFile() {
    return this.api.pickFile()
  }

  confirm(message) {
    return this.api.confirm(message)
  }

  saveFile(name, text) {
    return this.api.saveFile(name, text)
  }
}
