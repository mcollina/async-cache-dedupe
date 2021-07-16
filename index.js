'use strict'

const kValues = require('./symbol')
const stringify = require('safe-stable-stringify')
const LRUCache = require('mnemonist/lru-cache')

class Cache {
  constructor (opts) {
    opts = opts || {}
    this[kValues] = {}
    this._cacheSize = opts.cacheSize || 1024
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

    const cacheSize = opts.cacheSize || this._cacheSize

    const wrapper = new Wrapper(func, key, serialize, cacheSize)

    this[kValues][key] = wrapper
    this[key] = wrapper.add.bind(wrapper)
  }
}

class Wrapper {
  constructor (func, key, serialize, cacheSize) {
    this.ids = new LRUCache(cacheSize)
    this.error = null
    this.started = false
    this.func = func
    this.key = key
    this.serialize = serialize
  }

  add (args) {
    const id = this.serialize ? this.serialize(args) : args
    const key = typeof id === 'string' ? id : stringify(id)

    let query = this.ids.get(key)
    if (!query) {
      query = new Query(id, args, this.func)
      this.ids.set(key, query)
    }

    return query.promise
  }
}

class Query {
  constructor (id, args, func) {
    this.id = id
    this.promise = func(args)
  }
}

module.exports = { Cache }
