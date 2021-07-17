'use strict'

const kValues = require('./symbol')
const stringify = require('safe-stable-stringify')
const LRUCache = require('mnemonist/lru-cache')

const kCacheSize = Symbol('kCacheSize')
const kTTL = Symbol('kTTL')

class Cache {
  constructor (opts) {
    opts = opts || {}
    this[kValues] = {}
    this[kCacheSize] = opts.cacheSize || 1024
    this[kTTL] = opts.ttl || 0
  }

  define (key, opts, func) {
    if (typeof opts === 'function') {
      func = opts
      opts = {}
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

    const wrapper = new Wrapper(func, key, serialize, cacheSize, ttl)

    this[kValues][key] = wrapper
    this[key] = wrapper.add.bind(wrapper)
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
  constructor (func, key, serialize, cacheSize, ttl) {
    this.ids = new LRUCache(cacheSize)
    this.error = null
    this.started = false
    this.func = func
    this.key = key
    this.serialize = serialize
    this.ttl = ttl
  }

  buildPromise (query, args, key) {
    query.promise = this.func(args)
    // we fork the promise chain on purpose
    query.promise.catch(() => this.ids.set(key, undefined))
    if (this.ttl > 0) {
      query.cachedOn = currentSecond()
    }
  }

  add (args) {
    const id = this.serialize ? this.serialize(args) : args
    const key = typeof id === 'string' ? id : stringify(id)

    let query = this.ids.get(key)
    if (!query) {
      query = new Query(id)
      this.buildPromise(query, args, key)
      this.ids.set(key, query)
    } else if (this.ttl > 0) {
      if (currentSecond() - query.cachedOn > this.ttl) {
        // restart
        this.buildPromise(query, args, key)
      }
    }

    return query.promise
  }
}

class Query {
  constructor (id) {
    this.id = id
    this.promise = null
    this.cachedOn = null
  }
}

module.exports.Cache = Cache
