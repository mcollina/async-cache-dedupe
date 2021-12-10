'use strict'

const { kValues, kStorage, kTTL, kOnDedupe, kOnHit, kOnMiss } = require('./symbol')
const stringify = require('safe-stable-stringify')

class Cache {
  /**
   * @param {!Object} opts
   * @param {!Storage} opts.storage - the storage to use
   * @param {?number} [opts.ttl=0] - in seconds; default is 0 seconds, so it only does dedupe without cache
   * @param {?function} opts.onDedupe
   * @param {?function} opts.onHit
   * @param {?function} opts.onMiss
   */
  constructor (options = {}) {
    if (!options.storage) {
      throw new Error('storage is required')
    }

    if (options.ttl && (typeof options.ttl !== 'number' || options.ttl < 0)) {
      throw new Error('ttl must be a positive integer greater than 0')
    }

    if (options.onDedupe && typeof options.onDedupe !== 'function') {
      throw new Error('onDedupe must be a function')
    }

    if (options.onHit && typeof options.onHit !== 'function') {
      throw new Error('onHit must be a function')
    }

    if (options.onMiss && typeof options.onMiss !== 'function') {
      throw new Error('onMiss must be a function')
    }

    this[kValues] = {}
    this[kStorage] = options.storage
    this[kTTL] = options.ttl || 0
    this[kOnDedupe] = options.onDedupe || noop
    this[kOnHit] = options.onHit || noop
    this[kOnMiss] = options.onMiss || noop
  }

  /**
   * add a new function to dedupe (and cache)
   * @param {!string} name name of the function
   * @param {?Object} [opts]
   * @param {?function} [opts.storage] storage to use; default is the one passed to the constructor
   * @param {?number} [opts.ttl] ttl for the results; default ttl is the one passed to the constructor
   * @param {?function} [opts.onDedupe] function to call on dedupe; default is the one passed to the constructor
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

    const storage = opts.storage || this[kStorage]
    const ttl = opts.ttl || this[kTTL]
    const onDedupe = opts.onDedupe || this[kOnDedupe]
    const onHit = opts.onHit || this[kOnHit]
    const onMiss = opts.onMiss || this[kOnMiss]

    const wrapper = new Wrapper(func, name, serialize, references, storage, ttl, onDedupe, onHit, onMiss)

    this[kValues][name] = wrapper
    this[name] = wrapper.add.bind(wrapper)
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

    // TODO validate references?

    return this[kValues][name].invalidate(references)
  }
}

class Wrapper {
  /**
   * @param {function} func
   * @param {string} name
   * @param {function} serialize
   * @param {function} references
   * @param {Storage} storage
   * @param {number} ttl
   * @param {function} onDedupe
   * @param {function} onHit
   * @param {function} onMiss
   */
  constructor (func, name, serialize, references, storage, ttl, onDedupe, onHit, onMiss) {
    this.dedupes = new Map()
    this.func = func
    this.name = name
    this.serialize = serialize
    this.references = references

    this.storage = storage
    this.ttl = ttl
    this.onDedupe = onDedupe
    this.onHit = onHit
    this.onMiss = onMiss
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

  add (args) {
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
  }

  /**
   * wrap the original func to sync storage
   */
  async wrapFunction (args, key) {
    const storageKey = this.getStorageKey(key)
    let data = this.storage.get(storageKey)
    if (data && typeof data.then === 'function') { data = await data }

    if (data !== undefined) {
      this.onHit(key)
      return data
    }

    this.onMiss(key)

    const result = await this.func(args, key)

    if (this.ttl < 1) {
      return result
    }

    if (!this.references) {
      let p = this.storage.set(storageKey, result, this.ttl)
      if (p && typeof p.then === 'function') {
        p = await p
      }
      return result
    }

    let references = this.references(args, key, result)
    if (references && typeof references.then === 'function') { references = await references }
    // TODO validate references?
    await this.storage.set(storageKey, result, this.ttl, references)

    return result
  }

  buildPromise (query, args, key) {
    query.promise = this.wrapFunction(args, key)

    // we fork the promise chain on purpose
    query.promise
      .then(result => {
        // clear the dedupe once done
        this.dedupes.set(key, undefined)
        return result
      })
      // TODO do we want an onError event?
      .catch(() => {
        this.dedupes.set(key, undefined)
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
      this.dedupes.set(key, undefined)
      await this.storage.remove(this.getStorageKey(key))
      return
    }
    await this.storage.clear(this.getStorageName())
    this.dedupes.clear()
  }

  async get (key) {
    return this.storage.get(key)
  }

  async set (key, value, ttl, references) {
    return this.storage.set(key, value, ttl, references)
  }

  async invalidate (references) {
    return this.storage.invalidate(references)
  }
}

class Query {
  constructor () {
    this.promise = null
  }
}

function noop () { }

module.exports.Cache = Cache
