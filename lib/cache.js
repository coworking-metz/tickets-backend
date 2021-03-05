const {join} = require('path')
const {outputJson} = require('fs-extra')

const cacheFilePath = join(__dirname, '..', 'cache.json')

class Cache {
  async load() {
    try {
      const indexedEntries = require(cacheFilePath)
      this._index = indexedEntries
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

    this.saveTimeout = setTimeout(() => this.save(), 10000)
  }

  async save() {
    await outputJson(cacheFilePath, this._index)
  }
}

module.exports = new Cache()
