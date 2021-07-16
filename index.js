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

  add (args) {
    const id = this.serialize ? this.serialize(args) : args
    const key = typeof id === 'string' ? id : stringify(id)

    let query = this.ids.get(key)
    if (!query) {
      query = new Query(id, args, this.func)
      this.ids.set(key, query)
    } else if (this.ttl > 0) {
      if (currentSecond() - query.lastAccessed > this.ttl) {
        // restart
        query.promise = this.func.call(null, args)
      }
    }

    query.touch()

    return query.promise
  }
}

class Query {
  constructor (id, args, func) {
    this.id = id
    this.promise = func(args)
    this.lastAccessed = null
  }

  touch () {
    this.lastAccessed = currentSecond()
  }
}

module.exports = { Cache }
