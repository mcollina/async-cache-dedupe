'use strict'

const kValues = require('./symbol')
const stringify = require('safe-stable-stringify')
const LRUCache = require('mnemonist/lru-cache')

const kSize = Symbol('kSize')
const kOnDedupe = Symbol('kOnDedupe')

class Cache {
  constructor (opts) {
    opts = opts || {}
    this[kValues] = {}
    this[kSize] = opts.size || 1024
    this[kOnDedupe] = opts.onDedupe || noop
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

    const size = opts.size || this[kSize]
    const onDedupe = opts.onDedupe || this[kOnDedupe]

    const wrapper = new Wrapper(func, key, serialize, size, onDedupe)

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

class Wrapper {
  constructor (func, key, serialize, size, /* ttl, */ onDedupe) {
    this.ids = new LRUCache(size)
    this.error = null
    this.func = func
    this.key = key
    this.serialize = serialize
    this.onDedupe = onDedupe
  }

  buildPromise (query, args, key) {
    query.promise = this.func(args, key)
    // we fork the promise chain on purpose
    query.promise
      .then(result => {
        // clear the cache when the promise is resolved
        this.ids.set(key, undefined)
        return result
      })
      .catch(() => this.ids.set(key, undefined))
  }

  getKey (args) {
    const id = this.serialize ? this.serialize(args) : args
    return typeof id === 'string' ? id : stringify(id)
  }

  add (args) {
    const key = this.getKey(args)
    const onDedupe = this.onDedupe

    let query = this.ids.get(key)
    if (!query) {
      query = new Query()
      this.buildPromise(query, args, key)
      this.ids.set(key, query)
    } else {
      onDedupe()
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
  }
}

function noop () {}

module.exports.Cache = Cache
