import {readFile, writeFile, mkdir} from 'node:fs/promises'

const CACHE_FILE_PATH = './data/cache.json'

class Cache {
  async load() {
    try {
      this._index = JSON.parse(await readFile(CACHE_FILE_PATH, {encoding: 'utf8'}))
    } catch {
      this._index = {}
    }
  }

  has(key) {
    return key in this._index
  }

  get(key) {
    return this._index[key]
  }

  set(key, value) {
    this._index[key] = value

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => this.save(), 10_000)
  }

  async save() {
    await mkdir('./data', {recursive: true})
    await writeFile(CACHE_FILE_PATH, JSON.stringify(this._index))
  }
}

const cache = new Cache()
export default cache
