'use strict'

const stringify = require('safe-stable-stringify')
const nullLogger = require('abstract-logging')
const StorageInterface = require('./interface')
const { findNotMatching } = require('../util')

/**
 * @typedef StorageRedisOptions
 * @property {!store} client
 * @property {?Logger} log
 * @property {?boolean} [invalidation=false]
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
    // if (options.invalidation && !options.listener) {
    //   throw new Error('Redis listener is required with invalidation')
    // }
    super(options)
    this.options = options
    this.invalidation = options.invalidation || false
  }

  async init () {
    this.log = this.options.log || nullLogger
    this.store = this.options.client

    if (!this.invalidation) {
      return
    }

    // TODO documentation
    await this.listen(this.options.listener)
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
    // TODO can keys contains * or so?
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
        this.log.warn({ msg: 'acd/storage/redis.set, invalidation is disabled, references are useless' })
        return
      }

      const writes = []

      // clear old references
      const currentReferences = await this.store.smembers('k:' + key)
      this.log.debug({ msg: 'acd/storage/redis.set current references', key, currentReferences })
      if (currentReferences.length > 1) {
        currentReferences.sort()
        references.sort()
        const referencesToRemove = findNotMatching(references, currentReferences)

        // remove key in current references
        for (const reference of referencesToRemove) {
          writes.push(['srem', 'r:' + reference, key])
        }
        writes.push(['del', 'k:' + key])
      }

      // TODO we can probably get referencesToAdd and referencesToRemove in a single loop
      const referencesToAdd = currentReferences.length > 1 ? findNotMatching(currentReferences, references) : references
      this.log.debug({ msg: 'acd/storage/redis.set references to add', key, referencesToAdd })

      for (let i = 0; i < referencesToAdd.length; i++) {
        const reference = referencesToAdd[i]
        // r: -> reference->keys
        writes.push(['sadd', 'r:' + reference, key])
      }
      // k: -> key-references
      writes.push(['sadd', 'k:' + key, references])

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
      if (removed) { await this.clearReferences(key) }
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
      const reads = references.map(reference => ['smembers', 'r:' + reference])
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
   * listen to redis events for expired and deleted keys
   */
  async listen (listener) {
    if (!listener) {
      this.log.warn({ msg: 'acd/storage/redis.listen, listener connection is missing' })
      return
    }

    this.listener = listener

    const db = listener.options ? (listener.options.db || 0) : 0

    // TODO check "notify-keyspace-events KEA" on redis if possible, or document

    try {
      // TODO check listener
      // TODO listen also maxmemory for evicted keys
      const subscribed = await listener.subscribe(`__keyevent@${db}__:expired`)
      if (subscribed !== 1) {
        throw new Error('cant subscribe to redis')
      }
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.listen error on redis subscribe', err })
      throw err
    }

    // TODO document this
    // @see https://redis.io/topics/notifications
    // redis-cli config set notify-keyspace-events KEA
    // redis-cli --csv psubscribe '__key*__:*'

    listener.on('message', (_channel, key) => {
      this.clearReferences(key)
    })
  }

  /**
   * note: does not throw on error
   * @param {string|string[]} keys
   */
  async clearReferences (keys) {
    try {
      if (!Array.isArray(keys)) { keys = [keys] }

      const reads = keys.map(key => ['smembers', `k:${key}`])
      const referencesKeys = await this.store.pipeline(reads).exec()

      this.log.debug({ msg: 'acd/storage/redis.clearReference references', keys, referencesKeys })

      const writes = {}
      for (let i = 0; i < keys.length; i++) {
        for (let j = 0; j < referencesKeys[i][1].length; j++) {
          const reference = 'r:' + referencesKeys[i][1][j]
          if (writes[reference]) { continue }
          writes[reference] = ['srem', reference, keys]
        }
        const key = 'k:' + keys[i]
        writes[key] = ['del', key]
      }

      this.log.debug({ msg: 'acd/storage/redis.clearReference writes pipeline', writes })
      await this.store.pipeline(Object.values(writes)).exec()
    } catch (err) {
      this.log.error({ msg: 'acd/storage/redis.clearReference error', err })
    }
  }
}

module.exports = StorageRedis
