const { Cache } = require('./src/cache')
const createStorage = require('./src/storage')

/**
   * @param {!Object} options
   * @param {!Object} [options.storage] - the storage to use; default is `{ type: 'memory' }`
   * @param {?number} [options.ttl=0] - in seconds; default is 0 seconds, so it only does dedupe without cache
   * @param {?function} options.onDedupe
   * @param {?function} options.onHit
   * @param {?function} options.onMiss
   */
function createCache (options) {
  if (!options) {
    options = { storage: { type: 'memory' } }
  } else if (!options.storage) {
    options.storage = { type: 'memory' }
  }
  const storage = createStorage(options.storage.type, options.storage.options)
  return new Cache({
    ...options,
    storage
  })
}

module.exports = {
  Cache,
  createCache,
  createStorage
}
