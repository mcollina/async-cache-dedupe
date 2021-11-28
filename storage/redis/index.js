'use strict'

const stringify = require('safe-stable-stringify')
const nullLogger = require('abstract-logging')
const StorageInterface = require('../interface')
const { findNotMatching } = require('../../util')

const GC_DEFAULT_CHUNK = 64
const GC_DEFAULT_LAZY_CHUNK = 64
const REFERENCES_DEFAULT_TTL = 60

/**
 * @typedef StorageRedisOptions
 * @property {!store} client
 * @property {?Logger} log
 * @property {?Object|boolean} [invalidation=false]
 * @property {?number} [referencesTTL=60]
 */

class StorageRedis extends StorageInterface {
  /**
   * @param {StorageRedisOptions} options
   */
  constructor (options) {
    // TODO validate options
    // if (!options.client) {
    //   throw new Error('Redis client is required')
    // }
    super(options)
    this.options = options
    this.invalidation = options.invalidation || false
    // TODO validate referencesTTL, doc
    this.referencesTTL = this.invalidation.referencesTTL || REFERENCES_DEFAULT_TTL
  }

  async init () {
    this.log = this.options.log || nullLogger
    this.store = this.options.client
  }

  getReferenceKeyLabel (reference) {
    return `r:${reference}`
  }

  getKeyReferenceLabel (key) {
    return `k:${key}`
  }

  /**
   * @param {string} key
   * @returns {undefined|*} undefined if key not found
   */
  async get (key) {
    this.log.debug({ msg: 'acd/storage/redis.get', key })

    try {
      const value = await this.store.get(key)
      if (!value) {
        if (!this.invalidation) {
          return undefined
        }

        // clear references because the key could be expired (or evicted)
        // note: no await
        this.clearReferences(key)
        return undefined
      }
      return JSON.parse(value)
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.get error', err, key })
    }
  }

  /**
   * set value by key
   * @param {string} key
   * @param {*} value
   * @param {number} ttl - ttl in seconds; zero means key will not be stored
   * @param {?string[]} references
   */
  async set (key, value, ttl, references) {
    // TODO can keys contains * or other special chars?
    this.log.debug({ msg: 'acd/storage/redis.set key', key, value, ttl, references })

    ttl = Number(ttl)
    if (!ttl || ttl < 0) {
      return
    }

    try {
      await this.store.set(key, stringify(value), 'EX', ttl)

      if (!references) {
        return
      }

      if (!this.invalidation) {
        this.log.warn({ msg: 'acd/storage/redis.set, invalidation is disabled, references are useless', key, references })
        return
      }

      const writes = []

      // clear old references
      const currentReferences = await this.store.smembers(this.getKeyReferenceLabel(key))
      this.log.debug({ msg: 'acd/storage/redis.set current references', key, currentReferences })
      if (currentReferences.length > 1) {
        currentReferences.sort()
        references.sort()
        const referencesToRemove = findNotMatching(references, currentReferences)

        // remove key in current references
        for (const reference of referencesToRemove) {
          writes.push(['srem', this.getReferenceKeyLabel(reference), key])
        }
        writes.push(['del', this.getKeyReferenceLabel(key)])
      }

      // TODO we can probably get referencesToAdd and referencesToRemove in a single loop
      const referencesToAdd = currentReferences.length > 1 ? findNotMatching(currentReferences, references) : references
      this.log.debug({ msg: 'acd/storage/redis.set references to add', key, referencesToAdd })

      for (let i = 0; i < referencesToAdd.length; i++) {
        const reference = referencesToAdd[i]
        const referenceKeyLabel = this.getReferenceKeyLabel(reference)
        // reference->keys
        writes.push(['sadd', referenceKeyLabel, key])
        // reset reference->keys ttl to max
        writes.push(['expire', referenceKeyLabel, this.referencesTTL])
      }
      const keyReferenceLabel = this.getKeyReferenceLabel(key)
      // key-references
      writes.push(['sadd', keyReferenceLabel, references])
      // key-references has the same ttl of key
      writes.push(['expire', keyReferenceLabel, ttl])

      this.log.debug({ msg: 'acd/storage/redis.set references writes', writes })

      await this.store.pipeline(writes).exec()
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.set error', err, key, ttl, references })
    }
  }

  /**
   * remove an entry by key
   * @param {string} key
   * @returns {boolean} indicates if key was removed
   */
  async remove (key) {
    this.log.debug({ msg: 'acd/storage/redis.remove', key })
    try {
      const removed = await this.store.del(key) > 0
      if (removed && this.invalidation) { await this.clearReferences(key) }
      return removed
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.remove error', err, key })
    }
  }

  /**
   * @param {string[]} references
   * @returns {string[]} removed keys
   */
  async invalidate (references) {
    if (!this.invalidation) {
      this.log.warn({ msg: 'acd/storage/redis.invalidate, exit due invalidation is disabled' })
      return []
    }

    this.log.debug({ msg: 'acd/storage/redis.invalidate', references })

    try {
      const reads = references.map(reference => ['smembers', this.getReferenceKeyLabel(reference)])
      const keys = await this.store.pipeline(reads).exec()

      this.log.debug({ msg: 'acd/storage/redis.invalidate keys', keys })

      const writes = []
      const removed = []
      for (let i = 0; i < keys.length; i++) {
        const key0 = keys[i][1]
        this.log.debug({ msg: 'acd/storage/redis.invalidate got keys to be invalidated', keys: key0 })
        for (let j = 0; j < key0.length; j++) {
          const key1 = key0[j]
          this.log.debug({ msg: 'acd/storage/redis.del key' + key1 })
          removed.push(key1)
          writes.push(['del', key1])
        }
      }

      await this.store.pipeline(writes).exec()
      await this.clearReferences(removed)
      return removed
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.invalidate error', err, references })
      return []
    }
  }

  /**
   * @param {string} name
   */
  async clear (name) {
    this.log.debug({ msg: 'acd/storage/redis.clear', name })

    try {
      if (!name) {
        await this.store.flushall()
        return
      }

      const keys = await this.store.keys(`${name}*`)
      this.log.debug({ msg: 'acd/storage/redis.clear keys', keys })

      const removes = keys.map(key => ['del', key])
      await this.store.pipeline(removes).exec()

      if (!this.invalidation) { return }
      await this.clearReferences(keys)
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.clear error', err, name })
    }
  }

  async refresh () {
    try {
      await this.store.flushall()
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.refresh error', err })
    }
  }

  /**
   * note: does not throw on error
   * @param {string|string[]} keys
   */
  async clearReferences (keys) {
    try {
      if (!keys) {
        this.log.warn({ msg: 'acd/storage/redis.clearReferences invalid call due to empty key' })
        return
      }

      if (!Array.isArray(keys)) { keys = [keys] }

      const reads = keys.map(key => ['smembers', this.getKeyReferenceLabel(key)])
      const referencesKeys = await this.store.pipeline(reads).exec()

      this.log.debug({ msg: 'acd/storage/redis.clearReferences references', keys, referencesKeys })

      const writes = {}
      for (let i = 0; i < keys.length; i++) {
        for (let j = 0; j < referencesKeys[i][1].length; j++) {
          const reference = this.getReferenceKeyLabel(referencesKeys[i][1][j])
          if (writes[reference]) { continue }
          writes[reference] = ['srem', reference, keys]
        }
        const key = this.getKeyReferenceLabel(keys[i])
        writes[key] = ['del', key]
      }

      this.log.debug({ msg: 'acd/storage/redis.clearReferences writes pipeline', writes })
      await this.store.pipeline(Object.values(writes)).exec()
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.clearReferences error', err })
    }
  }

  /**
   * scan references and clean expired/evicted keys
   * @param {?string} [mode=lazy] lazy or strict
   * - in lazy mode, only `options.max` references are scanned every time, picking keys to check randomly
   *   so this operation is lighter while does not ensure references perferction
   * - in strict mode, all references and keys are checked
   *   this operation scan the whole db and is slow
   * @param {number} [options.chunk=64] number of references to retrieve at once
   * @param {number|undefined} [options.lazy.cursor] cursor to start the scan; should be last cursor returned by scan; default start from the beginning
   * @param {number} [options.lazy.chunk=64] number of references to check per gc cycle
   * @return {Object} stats TODO
   *
   * TODO doc: a good strategy is 1 strict gc every N lazy gc
   * TODO doc: conseguences of dirty references (measure slowdown?)
   */
  async gc (mode = 'lazy', options = {}) {
    this.log.debug({ msg: 'acd/storage/redis.gc', mode, options })

    if (!this.invalidation) {
      this.log.warn({ msg: 'acd/storage/redis.gc does not run due to invalidation is disabled' })
      return
    }

    // TODO validate options

    const chunk = options.chunk || GC_DEFAULT_CHUNK
    const optionsLazy = options.lazy || {}
    // max > 1
    const lazyChunk = optionsLazy.max || GC_DEFAULT_LAZY_CHUNK
    let cursor = optionsLazy.cursor || 0
    const startingCursor = cursor
    const scanCount = Math.min(lazyChunk, chunk)
    // let count = 0

    try {
      let referencesLength = -1
      let lastRemoved = -1
      do {
        const scan = await this.store.scan(cursor, 'match', 'r:*', 'count', scanCount)
        cursor = Number(scan[0])
        const references = scan[1]
        referencesLength = references.length

        // TODO if mode === 'lazy'
        // references = randomSubset(references, lazyChunk)
        // update stats

        // this.log.debug({ msg: 'acd/storage/redis.gc scan references', references })

        let reads = []
        for (let i = 0; i < references.length; i++) {
          const reference = references[i]
          reads.push(['smembers', reference])
        }
        let keys = await this.store.pipeline(reads).exec()

        const keysMap = {}
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]
          for (let j = 0; j < key[1].length; j++) {
            const k = key[1][j]
            if (!keysMap[k]) {
              keysMap[k] = [references[i]]
            } else {
              keysMap[k].push(references[i])
            }
          }
        }

        keys = Object.keys(keysMap)
        reads = keys.map(key => ['exists', key])
        const existingKeys = await this.store.pipeline(reads).exec()

        const removingKeys = {}
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]
          if (existingKeys[i][1] === 1) { continue }

          for (let j = 0; j < keysMap[key].length; j++) {
            const reference = keysMap[key][j]
            if (!removingKeys[reference]) {
              removingKeys[reference] = [key]
            } else {
              removingKeys[reference].push(key)
            }
          }
        }

        const writeReferences = Object.keys(removingKeys)
        const writes = []
        for (let i = 0; i < writeReferences.length; i++) {
          const reference = writeReferences[i]
          writes.push(['srem', reference, removingKeys[reference]])
        }
        await this.store.pipeline(writes).exec()
        lastRemoved = writes.length

        // TODO
        // if (mode === 'lazy' && count >= lazyChunk) {
        //   break
        // }

        // cursor = 0 means scan made a "full iteration", so it scanned all the references
        // see https://redis.io/commands/scan
      } while ((startingCursor === cursor || cursor === 0) && referencesLength > 0 && lastRemoved > 0)

      return { cursor } // TODO return stats (scanned references, removed keys, loops)
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.gc error', err })
      throw err
    }
  }
}

module.exports = StorageRedis
