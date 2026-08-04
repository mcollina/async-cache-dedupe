'use strict'

const { kValues, kStorage, kStorages, kTransfromer, kTTL, kOnDedupe, kOnError, kOnHit, kOnMiss, kStale, kSyncCache } = require('./symbol')
const stringify = require('safe-stable-stringify')
const createStorage = require('./storage')
const { LRUCache } = require('mnemonist')

class Cache {
  /**
   * @param {!Object} opts
   * @param {!Storage} opts.storage - the storage to use
   * @param {?Object} opts.transformer - the transformer to use
   * @param {?number} [opts.ttl=0] - in seconds; default is 0 seconds, so it only does dedupe without cache
   * @param {?function} opts.onDedupe
   * @param {?function} opts.onError
   * @param {?function} opts.onHit
   * @param {?function} opts.onMiss
   */
  constructor (options = {}) {
    if (!options.storage) {
      throw new Error('storage is required')
    }

    // ttl _may_ be a function to defer the ttl decision until later
    if (options.ttl && typeof options.ttl === 'number' && (options.ttl < 0 || !Number.isInteger(options.ttl))) {
      throw new Error('ttl must be a positive integer greater than 0')
    }

    if (options.onDedupe && typeof options.onDedupe !== 'function') {
      throw new Error('onDedupe must be a function')
    }

    if (options.onError && typeof options.onError !== 'function') {
      throw new Error('onError must be a function')
    }

    if (options.onHit && typeof options.onHit !== 'function') {
      throw new Error('onHit must be a function')
    }

    if (options.onMiss && typeof options.onMiss !== 'function') {
      throw new Error('onMiss must be a function')
    }

    // stale _may_ be a function to defer the stale decision until later
    if (typeof options.stale === 'number' && !(Math.floor(options.stale) === options.stale && options.stale >= 0)) {
      throw new Error('stale must be an integer greater or equal to 0')
    }

    if (options.syncCache !== undefined && options.syncCache !== null) {
      if (typeof options.syncCache !== 'object') {
        throw new Error('syncCache must be an object with size and ttl')
      }
      if (typeof options.syncCache.size !== 'number' || !Number.isInteger(options.syncCache.size) || options.syncCache.size < 1) {
        throw new Error('syncCache.size must be a positive integer greater than 0')
      }
      if (typeof options.syncCache.ttl !== 'number' || !Number.isInteger(options.syncCache.ttl) || options.syncCache.ttl < 1) {
        throw new Error('syncCache.ttl must be a positive integer greater than 0 (in milliseconds)')
      }
    }

    this[kValues] = {}

    this[kStorage] = options.storage
    this[kStorages] = new Map()
    this[kStorages].set('_default', options.storage)

    this[kTransfromer] = options.transformer

    this[kTTL] = options.ttl || 0
    this[kOnDedupe] = options.onDedupe || noop
    this[kOnError] = options.onError || noop
    this[kOnHit] = options.onHit || noop
    this[kOnMiss] = options.onMiss || noop
    this[kStale] = options.stale || 0
    this[kSyncCache] = options.syncCache || null
  }

  /**
   * add a new function to dedupe (and cache)
   * @param {!string} name name of the function
   * @param {?Object} [opts]
   * @param {?Object} [opts.storage] storage to use; default is the main one
   * @param {?Object} opts.transformer - the transformer to use
   * @param {?number} [opts.ttl] ttl for the results; default ttl is the one passed to the constructor
   * @param {?function} [opts.onDedupe] function to call on dedupe; default is the one passed to the constructor
   * @param {?function} [opts.onError] function to call on error; default is the one passed to the constructor
   * @param {?function} [opts.onHit] function to call on hit; default is the one passed to the constructor
   * @param {?function} [opts.onMiss] function to call on miss; default is the one passed to the constructor
   * @param {?function} [opts.serialize] custom function to serialize the arguments of `func`, in order to create the key for deduping and caching
   * @param {?function} [opts.references] function to generate references
   * @param {!function} func the function to dedupe (and cache)
   **/
  define (name, opts, func) {
    if (typeof opts === 'function') {
      func = opts
      opts = {}
    }

    if (name && this[name]) {
      throw new Error(`${name} is already defined in the cache or it is a forbidden name`)
    }

    opts = opts || {}

    if (typeof func !== 'function') {
      throw new TypeError(`Missing the function parameter for '${name}'`)
    }

    const serialize = opts.serialize
    if (serialize && typeof serialize !== 'function') {
      throw new TypeError('serialize must be a function')
    }

    const references = opts.references
    if (references && typeof references !== 'function') {
      throw new TypeError('references must be a function')
    }

    if (typeof opts.ttl !== 'function') {
      if (opts.ttl && (typeof opts.ttl !== 'number' || opts.ttl < 0 || !Number.isInteger(opts.ttl))) {
        throw new Error('ttl must be a positive integer greater than 0')
      }
    }

    if (opts.syncCache !== undefined && opts.syncCache !== null) {
      if (typeof opts.syncCache !== 'object') {
        throw new Error('syncCache must be an object with size and ttl')
      }
      if (typeof opts.syncCache.size !== 'number' || !Number.isInteger(opts.syncCache.size) || opts.syncCache.size < 1) {
        throw new Error('syncCache.size must be a positive integer greater than 0')
      }
      if (typeof opts.syncCache.ttl !== 'number' || !Number.isInteger(opts.syncCache.ttl) || opts.syncCache.ttl < 1) {
        throw new Error('syncCache.ttl must be a positive integer greater than 0 (in milliseconds)')
      }
    }

    let storage
    if (opts.storage) {
      storage = createStorage(opts.storage.type, opts.storage.options)
      this[kStorages].set(name, storage)
    } else {
      storage = this[kStorage]
    }

    const ttl = opts.ttl !== undefined ? opts.ttl : this[kTTL]
    const stale = opts.stale !== undefined ? opts.stale : this[kStale]
    const onDedupe = opts.onDedupe || this[kOnDedupe]
    const onError = opts.onError || this[kOnError]
    const onHit = opts.onHit || this[kOnHit]
    const onMiss = opts.onMiss || this[kOnMiss]
    const transformer = opts.transformer || this[kTransfromer]
    const syncCache = opts.syncCache !== undefined ? opts.syncCache : this[kSyncCache]

    const wrapper = new Wrapper(func, name, serialize, references, storage, transformer, ttl, onDedupe, onError, onHit, onMiss, stale, syncCache)

    this[kValues][name] = wrapper
    this[name] = wrapper.add.bind(wrapper)
    return this
  }

  async clear (name, value) {
    if (name) {
      if (!this[kValues][name]) {
        throw new Error(`${name} is not defined in the cache`)
      }

      await this[kValues][name].clear(value)
      return
    }

    const clears = []
    for (const wrapper of Object.values(this[kValues])) {
      clears.push(wrapper.clear())
    }
    await Promise.all(clears)
  }

  async get (name, key) {
    if (!this[kValues][name]) {
      throw new Error(`${name} is not defined in the cache`)
    }

    // TODO validate key?

    return this[kValues][name].get(key)
  }

  getSync (name, key) {
    if (!this[kValues][name]) {
      throw new Error(`${name} is not defined in the cache`)
    }

    return this[kValues][name].getSync(key)
  }

  async exists (name, key) {
    if (!this[kValues][name]) {
      throw new Error(`${name} is not defined in the cache`)
    }
    return this[kValues][name].exists(key)
  }

  async set (name, key, value, ttl, references) {
    if (!this[kValues][name]) {
      throw new Error(`${name} is not defined in the cache`)
    }

    // TODO validate key, value, ttl, references?

    return this[kValues][name].set(key, value, ttl, references)
  }

  async invalidate (name, references) {
    if (!this[kValues][name]) {
      throw new Error(`${name} is not defined in the cache`)
    }

    return this[kValues][name].invalidate(references)
  }

  async invalidateAll (references, storage = '_default') {
    if (!this[kStorages].has(storage)) {
      throw new Error(`${storage} storage is not defined in the cache`)
    }
    const s = this[kStorages].get(storage)
    await s.invalidate(references)
  }
}

class Wrapper {
  /**
   * @param {function} func
   * @param {string} name
   * @param {function} serialize
   * @param {function} references
   * @param {Storage} storage
   * @param {Object} transformer
   * @param {number} ttl
   * @param {function} onDedupe
   * @param {function} onError
   * @param {function} onHit
   * @param {function} onMiss
   * @param {stale} ttl
   * @param {?{size: number, ttl: number}} syncCache
   */
  constructor (func, name, serialize, references, storage, transformer, ttl, onDedupe, onError, onHit, onMiss, stale, syncCache) {
    this.dedupes = new Map()
    this.staleDedupes = new Set()
    this.func = func
    this.name = name
    this.serialize = serialize
    this.references = references

    this.storage = storage
    this.transformer = transformer
    this.ttl = ttl
    this.onDedupe = onDedupe
    this.onError = onError
    this.onHit = onHit
    this.onMiss = onMiss
    this.stale = stale
    this.syncCacheConfig = syncCache || null
    // Lazily created on first sync read/write to avoid the LRU
    // overhead for wrappers that never use getSync.
    this._syncStore = null
    // reference -> set of storage keys; mirrors StorageMemory's
    // keysReferences / referencesKeys structure for invalidation.
    this._syncRefKeys = null
  }

  getKey (args) {
    const id = this.serialize ? this.serialize(args) : args
    return typeof id === 'string' ? id : stringify(id)
  }

  getStorageKey (key) {
    return `${this.name}~${key}`
  }

  getStorageName () {
    return `${this.name}~`
  }

  /**
   * Strip the `${name}~` prefix from a storage key to recover the user
   * key. Returns undefined if the storage key doesn't belong to this
   * wrapper.
   */
  _userKeyFromStorageKey (storageKey) {
    if (typeof storageKey !== 'string') {
      return undefined
    }
    const prefix = this.getStorageName()
    if (storageKey.startsWith(prefix)) {
      return storageKey.slice(prefix.length)
    }
    return undefined
  }

  /**
   * Lazily create the in-process LRU that backs getSync. Each entry
   * stores { value, insertedAt } so we can apply a per-entry TTL.
   */
  _ensureSyncStore () {
    if (this._syncStore !== null) {
      return
    }
    this._syncStore = new LRUCache(this.syncCacheConfig.size)
    this._syncRefKeys = new Map()
  }

  /**
   * Read from the sync LRU; returns the cached value if present and
   * within the staleness window, otherwise undefined. Does not perform
   * any I/O.
   */
  _readSyncCache (key) {
    this._ensureSyncStore()
    const entry = this._syncStore.get(key)
    if (!entry) {
      return undefined
    }
    if (nowMs() - entry.insertedAt >= this.syncCacheConfig.ttl) {
      // mnemonist's LRUCache is append-only; overwriting with undefined
      // makes the next get() return undefined, matching the pattern used
      // by StorageMemory._removeKey.
      this._syncStore.set(key, undefined)
      return undefined
    }
    return entry.value
  }

  /**
   * Write to the sync LRU. The data is stored as-is; transformer
   * application happens in `_maybeDeserialize` on read.
   */
  _writeSyncCache (key, value, references) {
    this._ensureSyncStore()
    this._syncStore.set(key, { value, insertedAt: nowMs() })

    if (!references || references.length < 1) {
      return
    }

    for (const ref of references) {
      let keys = this._syncRefKeys.get(ref)
      if (!keys) {
        keys = new Set()
        this._syncRefKeys.set(ref, keys)
      }
      keys.add(key)
    }
  }

  /**
   * Remove sync LRU entries that have any of the given references.
   */
  _invalidateSyncCacheByReferences (references) {
    if (!this._syncStore) {
      return
    }
    const refs = Array.isArray(references) ? references : [references]
    for (const ref of refs) {
      const keys = this._syncRefKeys.get(ref)
      if (!keys) {
        continue
      }
      for (const key of keys) {
        this._syncStore.set(key, undefined)
      }
      this._syncRefKeys.delete(ref)
    }
  }

  /**
   * Remove a single sync LRU entry (used by Wrapper.set on overwrite).
   */
  _removeSyncCache (key) {
    if (!this._syncStore) {
      return
    }
    this._syncStore.set(key, undefined)
    for (const keys of this._syncRefKeys.values()) {
      keys.delete(key)
    }
  }

  /**
   * Clear all sync LRU entries for this wrapper.
   */
  _clearSyncCache () {
    if (this._syncStore) {
      this._syncStore.clear()
    }
    if (this._syncRefKeys) {
      this._syncRefKeys.clear()
    }
  }

  /**
   * Apply the transformer (if any) to a value read synchronously.
   * Returns undefined if the transformer is async (caller should fall
   * back to the async path).
   */
  _maybeDeserialize (data) {
    if (data === undefined) {
      return undefined
    }
    if (this.transformer && typeof this.transformer.deserialize === 'function') {
      if (this.transformer.deserialize.constructor.name === 'AsyncFunction') {
        return undefined
      }
      return this.transformer.deserialize(data)
    }
    return data
  }

  add (args) {
    try {
      const key = this.getKey(args)

      let query = this.dedupes.get(key)
      if (!query) {
        query = new Query()
        this.buildPromise(query, args, key)
        this.dedupes.set(key, query)
      } else {
        this.onDedupe(key)
      }

      return query.promise
    } catch (err) {
      this.onError(err)
    }
  }

  /**
   * wrap the original func to sync storage
   */
  async wrapFunction (args, key) {
    const storageKey = this.getStorageKey(key)
    if (this.ttl > 0 || typeof this.ttl === 'function') {
      const data = await this.get(storageKey)

      if (data !== undefined) {
        this.onHit(key)
        if (this.syncCacheConfig) {
          this._writeSyncCache(key, data)
        }
        const stale = typeof this.stale === 'function' ? this.stale(data) : this.stale
        if (stale > 0) {
          const remainingTTL = await this.storage.getTTL(storageKey)
          if (remainingTTL <= stale && !this.staleDedupes.has(key)) {
            this.staleDedupes.add(key)
            this._wrapFunction(storageKey, args, key).catch(noop).finally(() => {
              this.staleDedupes.delete(key)
            })
          }
        }
        return data
      } else {
        this.onMiss(key)
      }
    }

    return this._wrapFunction(storageKey, args, key)
  }

  async _wrapFunction (storageKey, args, key) {
    const result = await this.func(args, key)
    const stale = typeof this.stale === 'function' ? this.stale(result) : this.stale
    let ttl = typeof this.ttl === 'function' ? this.ttl(result) : this.ttl
    if (ttl === undefined || ttl === null || (typeof ttl !== 'number' || !Number.isInteger(ttl))) {
      this.onError(new Error('ttl must be an integer'))
      return result
    }
    ttl += stale
    if (ttl < 1) {
      return result
    }

    if (!this.references) {
      await this.set(storageKey, result, ttl)
      if (this.syncCacheConfig) {
        this._writeSyncCache(key, result)
      }
      return result
    }

    let references
    try {
      references = this.references(args, key, result)
      let value = result
      if (references && typeof references.then === 'function') { references = await references }
      if (this.transformer) {
        value = this.transformer.serialize(result)
      }
      // TODO validate references?
      await this.storage.set(storageKey, value, ttl, references)
    } catch (err) {
      this.onError(err)
    }

    if (this.syncCacheConfig) {
      this._writeSyncCache(key, result, references)
    }

    return result
  }

  buildPromise (query, args, key) {
    query.promise = this.wrapFunction(args, key)

    // we fork the promise chain on purpose
    query.promise
      .then(result => {
        // clear the dedupe once done
        this.dedupes.delete(key)
        return result
      })
      .catch(err => {
        this.onError(err)
        this.dedupes.delete(key)
        // TODO option to remove key from storage on error?
        // we may want to relay on cache if the original function got error
        // then we probably need more option for that
        const r = this.storage.remove(this.getStorageKey(key))
        if (r && typeof r.catch === 'function') { r.catch(noop) }
      })
  }

  async clear (value) {
    // TODO validate value?
    if (value) {
      const key = this.getKey(value)
      this.dedupes.delete(key)
      this.staleDedupes.delete(key)
      this._removeSyncCache(key)
      await this.storage.remove(this.getStorageKey(key))
      return
    }
    await this.storage.clear(this.getStorageName())
    this.dedupes.clear()
    this.staleDedupes.clear()
    this._clearSyncCache()
  }

  async get (key) {
    const data = await this.storage.get(key)
    if (this.transformer && !!data) {
      return await this.transformer.deserialize(data)
    }
    return data
  }

  /**
   * Synchronous variant of get. Reads the opt-in in-process LRU
   * (syncCache) first; falls back to the underlying storage's
   * getSync when the LRU is empty AND the LRU is not configured.
   *
   * When syncCache is configured, the LRU is authoritative for sync
   * reads: a stale or missing entry returns undefined even if the
   * underlying storage would still have the data. This is by design
   * — the caller is opting into bounded staleness, not into a
   * best-effort fallback.
   *
   * Returns undefined on miss, expired entry, or when the
   * transformer.deserialize is async.
   *
   * @param {string} key
   * @returns {undefined|*}
   */
  getSync (key) {
    try {
      if (this.syncCacheConfig) {
        const hit = this._readSyncCache(key)
        if (hit !== undefined) {
          this.onHit(key)
          return this._maybeDeserialize(hit)
        }
        // sync LRU is the source of truth for sync reads; do not
        // fall back to the underlying storage when configured.
        return undefined
      }
      const data = this.storage.getSync(this.getStorageKey(key))
      if (data === undefined) {
        return undefined
      }
      return this._maybeDeserialize(data)
    } catch (err) {
      this.onError(err)
      return undefined
    }
  }

  async exists (key) {
    return await this.storage.exists(key)
  }

  async set (key, value, ttl, references) {
    // Overwriting a key invalidates the corresponding sync-cache entry;
    // the new value is not yet in the sync cache and must be re-fetched
    // (or rewritten by the wrapped function) before getSync can hit.
    const userKey = this._userKeyFromStorageKey(key)
    if (userKey !== undefined) {
      this._removeSyncCache(userKey)
    }
    if (this.transformer) {
      value = this.transformer.serialize(value)
    }
    return this.storage.set(key, value, ttl, references)
  }

  async invalidate (references) {
    if (this.syncCacheConfig) {
      this._invalidateSyncCacheByReferences(references)
    }
    return this.storage.invalidate(references)
  }
}

class Query {
  constructor () {
    this.promise = null
  }
}

function noop () { }

function nowMs () {
  return Date.now()
}

module.exports.Cache = Cache
