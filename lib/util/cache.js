import {readFile, writeFile, mkdir} from 'node:fs/promises'

const CACHE_FILE_PATH = './data/cache.json'

class Cache {
  async load() {
    if (!this.loadingPromise) {
      // eslint-disable-next-line no-async-promise-executor
      this.loadingPromise = new Promise(async resolve => {
        try {
          const jsonData = await readFile(CACHE_FILE_PATH, {encoding: 'utf8'})
          this._index = JSON.parse(jsonData)
          resolve()
        } catch {
          this._index = {}
          resolve()
        }
      })
    }

    return this.loadingPromise
  }

  async has(key) {
    await this.load()
    return key in this._index
  }

  async get(key) {
    await this.load()
    return this._index[key]
  }

  async set(key, value) {
    await this.load()

    this._index[key] = value

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => this.save(), 10_000)
  }

  async remove(key) {
    await this.load()
    delete this._index[key]

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => this.save(), 10_000)
  }

  async clear() {
    await this.load()
    this._index = {}

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
