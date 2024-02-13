'use strict'

const LRUCache = require('mnemonist/lru-cache')
const { abstractLogging } = require('../util')
const StorageInterface = require('./interface')
const { findMatchingIndexes, findNotMatching, bsearchIndex, wildcardMatch } = require('../util')

/* c8 ignore next */
const setImmediate = typeof globalThis.setImmediate !== 'undefined' ? globalThis.setImmediate : (fn, ...args) => setTimeout(fn, 0, ...args)

const DEFAULT_CACHE_SIZE = 1024

/**
 * @typedef StorageMemoryOptions
 * @property {?number} [size=1024]
 * @property {?Logger} [log]
 * @property {?boolean} [invalidation=false]
 */

class StorageMemory extends StorageInterface {
  /**
   * in-memory storage
   * @param {StorageMemoryOptions} options
   */
  constructor (options = {}) {
    if (options.size && (typeof options.size !== 'number' || options.size < 1)) {
      throw new Error('size must be a positive integer greater than 0')
    }

    super(options)
    this.size = options.size || DEFAULT_CACHE_SIZE
    this.log = options.log || abstractLogging()
    this.invalidation = options.invalidation || false

    this.init()
  }

  init () {
    this.store = new LRUCache(this.size)

    if (!this.invalidation) {
      return
    }
    // key -> references, keys are strings, references are sorted array strings
    this.keysReferences = new Map()
    // same as above, but inverted
    this.referencesKeys = new Map()
  }

  /**
   * retrieve the value by key
   * @param {string} key
   * @returns {undefined|*} undefined if key not found or expired
   */
  get (key) {
    this.log.debug({ msg: 'acd/storage/memory.get', key })

    const entry = this.store.get(key)
    if (entry) {
      this.log.debug({ msg: 'acd/storage/memory.get, entry', entry, now: now() })
      if (entry.start + entry.ttl > now()) {
        this.log.debug({ msg: 'acd/storage/memory.get, key is NOT expired', key, entry })
        return entry.value
      }
      this.log.debug({ msg: 'acd/storage/memory.get, key is EXPIRED', key, entry })

      // no need to wait for key to be removed

      setImmediate(() => this.remove(key))
    }
  }

  /**
   * retrieve the remaining TTL value by key
   * @param {string} key
   * @returns {undefined|*} undefined if key not found or expired
   */
  getTTL (key) {
    this.log.debug({ msg: 'acd/storage/memory.getTTL', key })

    const entry = this.store.peek(key)
    let ttl = 0
    if (entry) {
      ttl = entry.start + entry.ttl - now()
      if (ttl < 0) {
        ttl = 0
      }
    }

    return ttl
  }

  /**
   * set value by key
   * @param {string} key
   * @param {*} value
   * @param {?number} [ttl=0] - ttl in seconds; zero means key will not be stored
   * @param {?string[]} references
   */
  set (key, value, ttl, references) {
    this.log.debug({ msg: 'acd/storage/memory.set', key, value, ttl, references })

    ttl = Number(ttl)
    if (!ttl || ttl < 0) {
      return
    }
    const existingKey = this.store.has(key)
    const removed = this.store.setpop(key, { value, ttl, start: now() })
    this.log.debug({ msg: 'acd/storage/memory.set, evicted', removed })
    if (removed && removed.evicted) {
      this.log.debug({ msg: 'acd/storage/memory.set, remove evicted key', key: removed.key })
      this._removeReferences([removed.key])
    }

    if (!references || references.length < 1) {
      return
    }

    if (!this.invalidation) {
      this.log.warn({ msg: 'acd/storage/memory.set, invalidation is disabled, references are useless' })
      return
    }

    // references must be unique
    references = [...new Set(references)]

    // clear old references
    let currentReferences
    if (existingKey) {
      currentReferences = this.keysReferences.get(key)
      this.log.debug({ msg: 'acd/storage/memory.set, current keys-references', key, references: currentReferences })
      if (currentReferences) {
        currentReferences.sort()
        references.sort()
        const referencesToRemove = findNotMatching(references, currentReferences)

        // remove key in old references
        for (const reference of referencesToRemove) {
          const keys = this.referencesKeys.get(reference)
          /* c8 ignore next */
          if (!keys) { continue }
          const index = bsearchIndex(keys, key)
          /* c8 ignore next */
          if (index < 0) { continue }
          keys.splice(index, 1)

          if (keys.length < 1) {
            this.referencesKeys.delete(reference)
            continue
          }
          this.referencesKeys.set(reference, keys)
        }
      }
    }

    // TODO we can probably get referencesToAdd and referencesToRemove in a single loop
    const referencesToAdd = currentReferences ? findNotMatching(currentReferences, references) : references

    for (let i = 0; i < referencesToAdd.length; i++) {
      const reference = referencesToAdd[i]
      let keys = this.referencesKeys.get(reference)
      if (keys) {
        this.log.debug({ msg: 'acd/storage/memory.set, add reference-key', key, reference })
        keys.push(key)
      } else {
        keys = [key]
      }
      this.log.debug({ msg: 'acd/storage/memory.set, set reference-keys', keys, reference })
      this.referencesKeys.set(reference, keys)
    }

    this.keysReferences.set(key, references)
  }

  /**
   * remove an entry by key
   * @param {string} key
   * @returns {boolean} indicates if key was removed
   */
  remove (key) {
    this.log.debug({ msg: 'acd/storage/memory.remove', key })

    const removed = this._removeKey(key)
    this._removeReferences([key])
    return removed
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  _removeKey (key) {
    this.log.debug({ msg: 'acd/storage/memory._removeKey', key })
    if (!this.store.has(key)) {
      return false
    }
    this.store.set(key, undefined)
    return true
  }

  /**
   * @param {string[]} keys
   */
  _removeReferences (keys) {
    if (!this.invalidation) {
      return
    }
    this.log.debug({ msg: 'acd/storage/memory._removeReferences', keys })

    const referencesToRemove = new Set()
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]

      const references = this.keysReferences.get(key)
      if (!references) {
        continue
      }

      for (let j = 0; j < references.length; j++) {
        referencesToRemove.add(references[j])
      }

      this.log.debug({ msg: 'acd/storage/memory._removeReferences, delete key-references', key })
      this.keysReferences.delete(key)
    }

    this._removeReferencesKeys([...referencesToRemove], keys)
  }

  /**
   * @param {!string[]} references
   * @param {string[]} keys
   */
  _removeReferencesKeys (references, keys) {
    keys.sort()
    this.log.debug({ msg: 'acd/storage/memory._removeReferencesKeys', references, keys })
    for (let i = 0; i < references.length; i++) {
      const reference = references[i]
      // working on the original stored array
      const referencesKeys = this.referencesKeys.get(reference)
      this.log.debug({ msg: 'acd/storage/memory._removeReferencesKeys, get reference-key', reference, keys, referencesKeys })
      /* c8 ignore next */
      if (!referencesKeys) continue

      const referencesToRemove = findMatchingIndexes(keys, referencesKeys)
      // cannot happen that referencesToRemove is empty
      // because this function is triggered only by _removeReferences
      // and "keys" are from tis.keyReferences
      // if (referencesToRemove.length < 1) { continue }

      this.log.debug({ msg: 'acd/storage/memory._removeReferencesKeys, removing', reference, referencesToRemove, referencesKeys })

      if (referencesToRemove.length === referencesKeys.length) {
        this.log.debug({ msg: 'acd/storage/memory._removeReferencesKeys, delete', reference })
        this.referencesKeys.delete(reference)
        continue
      }

      for (let j = referencesToRemove.length - 1; j >= 0; j--) {
        this.log.debug({ msg: 'acd/storage/memory._removeReferencesKeys, remove', reference, referencesKeys, at: referencesToRemove[j] })
        referencesKeys.splice(referencesToRemove[j], 1)
      }
    }
  }

  /**
   * @param {string|string[]} references
   * @returns {string[]} removed keys
   */
  invalidate (references) {
    if (!this.invalidation) {
      this.log.warn({ msg: 'acd/storage/memory.invalidate, exit due invalidation is disabled' })
      return []
    }

    this.log.debug({ msg: 'acd/storage/memory.invalidate', references })

    if (Array.isArray(references)) {
      return this._invalidateReferences(references)
    }
    return this._invalidateReference(references)
  }

  /**
   * @param {string[]} references
   * @returns {string[]} removed keys
   */
  _invalidateReferences (references) {
    const removed = []
    for (let i = 0; i < references.length; i++) {
      const reference = references[i]
      const keys = this.referencesKeys.get(reference)
      this.log.debug({ msg: 'acd/storage/memory._invalidateReferences, remove keys on reference', reference, keys })
      if (!keys) {
        continue
      }

      for (let j = 0; j < keys.length; j++) {
        const key = keys[j]
        this.log.debug({ msg: 'acd/storage/memory._invalidateReferences, remove key on reference', reference, key })
        if (this._removeKey(key)) {
          removed.push(key)
        }
      }

      this.log.debug({ msg: 'acd/storage/memory._invalidateReferences, remove references of', reference, keys })
      this._removeReferences([...keys])
    }

    return removed
  }

  /**
   * @param {string} reference
   * @returns {string[]} removed keys
   */
  _invalidateReference (reference) {
    if (reference.includes('*')) {
      const references = []
      for (const key of this.referencesKeys.keys()) {
        if (wildcardMatch(reference, key)) {
          references.push(key)
        }
      }
      return this._invalidateReferences(references)
    }

    const keys = this.referencesKeys.get(reference)
    const removed = []
    this.log.debug({ msg: 'acd/storage/memory._invalidateReference, remove keys on reference', reference, keys })

    if (!keys) {
      return removed
    }

    for (let j = 0; j < keys.length; j++) {
      const key = keys[j]
      this.log.debug({ msg: 'acd/storage/memory._invalidateReference, remove key on reference', reference, key })
      if (this._removeKey(key)) {
        removed.push(key)
      }
    }

    this.log.debug({ msg: 'acd/storage/memory._invalidateReference, remove references of', reference, keys })
    this._removeReferences([...keys])

    return removed
  }

  /**
   * remove all entries if name is not provided
   * remove entries where key starts with name if provided
   * @param {?string} name
   * @return {string[]} removed keys
   */
  clear (name) {
    this.log.debug({ msg: 'acd/storage/memory.clear', name })

    if (!name) {
      this.store.clear()
      if (!this.invalidation) { return }
      this.referencesKeys.clear()
      this.keysReferences.clear()
      return
    }

    const keys = []
    this.store.forEach((value, key) => {
      this.log.debug({ msg: 'acd/storage/memory.clear, iterate key', key })
      if (key.indexOf(name) === 0) {
        this.log.debug({ msg: 'acd/storage/memory.clear, remove key', key })
        // can't remove here or the loop won't work
        keys.push(key)
      }
    })

    const removed = []
    // remove all keys at first, then references
    for (let i = 0; i < keys.length; i++) {
      if (this._removeKey(keys[i])) {
        removed.push(keys[i])
      }
    }

    this._removeReferences(removed)

    return removed
  }

  refresh () {
    this.log.debug({ msg: 'acd/storage/memory.refresh' })

    this.init()
  }
}

let _timer

function now () {
  if (_timer !== undefined) {
    return _timer
  }
  _timer = Math.floor(Date.now() / 1000)
  const timeout = setTimeout(_clearTimer, 1000)
  if (typeof timeout.unref === 'function') timeout.unref()
  return _timer
}

function _clearTimer () {
  _timer = undefined
}

module.exports = StorageMemory
