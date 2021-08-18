'use strict'

const kValues = require('./symbol')
const stringify = require('safe-stable-stringify')
const LRUCache = require('mnemonist/lru-cache')

const kCacheSize = Symbol('kCacheSize')
const kTTL = Symbol('kTTL')
const kOnHit = Symbol('kOnHit')

class Cache {
  constructor (opts) {
    opts = opts || {}
    this[kValues] = {}
    this[kCacheSize] = opts.cacheSize || 1024
    this[kTTL] = opts.ttl || 0
    this[kOnHit] = opts.onHit || noop
  }

  define (key, opts, func) {
    if (typeof opts === 'function') {
      func = opts
      opts = {}
    }

    if (key && this[key]) {
      throw new Error(`${key} is already defined in the cache or it is a forbidden name`)
    }

    opts = opts || {}

    if (typeof func !== 'function') {
      throw new TypeError(`Missing the function parameter for '${key}'`)
    }

    const serialize = opts.serialize
    if (serialize && typeof serialize !== 'function') {
      throw new TypeError('serialize must be a function')
    }

    const cacheSize = opts.cacheSize || this[kCacheSize]
    const ttl = opts.ttl || this[kTTL]
    const onHit = opts.onHit || this[kOnHit]

    const wrapper = new Wrapper(func, key, serialize, cacheSize, ttl, onHit)

    this[kValues][key] = wrapper
    this[key] = wrapper.add.bind(wrapper)
  }

  clear (key, value) {
    if (key) {
      this[kValues][key].clear(value)
      return
    }

    for (const wrapper of Object.values(this[kValues])) {
      wrapper.clear()
    }
  }
}

let _currentSecond

function currentSecond () {
  if (_currentSecond !== undefined) {
    return _currentSecond
  }
  _currentSecond = Math.floor(Date.now() / 1000)
  setTimeout(_clearSecond, 1000).unref()
  return _currentSecond
}

function _clearSecond () {
  _currentSecond = undefined
}

class Wrapper {
  constructor (func, key, serialize, cacheSize, ttl, onHit) {
    this.ids = new LRUCache(cacheSize)
    this.error = null
    this.started = false
    this.func = func
    this.key = key
    this.serialize = serialize
    this.ttl = ttl
    this.onHit = onHit
  }

  buildPromise (query, args, key) {
    query.promise = this.func(args, key)
    // we fork the promise chain on purpose
    query.promise.catch(() => this.ids.set(key, undefined))
    if (this.ttl > 0) {
      query.cachedOn = currentSecond()
    }
  }

  getKey (args) {
    const id = this.serialize ? this.serialize(args) : args
    return typeof id === 'string' ? id : stringify(id)
  }

  add (args) {
    const key = this.getKey(args)
    const onHit = this.onHit

    let query = this.ids.get(key)
    if (!query) {
      query = new Query()
      this.buildPromise(query, args, key)
      this.ids.set(key, query)
    } else if (this.ttl > 0) {
      onHit()
      if (currentSecond() - query.cachedOn > this.ttl) {
        // restart
        this.buildPromise(query, args, key)
      }
    } else {
      onHit()
    }

    return query.promise
  }

  clear (value) {
    if (value) {
      const key = this.getKey(value)
      this.ids.set(key, undefined)
      return
    }
    this.ids.clear()
  }
}

class Query {
  constructor () {
    this.promise = null
    this.cachedOn = null
  }
}

function noop () {}

module.exports.Cache = Cache
