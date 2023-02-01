'use strict'

const { Cache } = require('../..')
const createStorage = require('../../src/storage')
const { kAsyncCacheDedupeSuiteName, kAsyncCacheDedupeSuiteHasMultipleTests } = require('./helpers/symbols.js')

module.exports = async function (test) {
  test('global ttl is a positive integer', async (t) => {
    t.plan(1)

    try {
      // eslint-disable-next-line no-new
      new Cache({ ttl: 3.14, storage: createStorage() })
    } catch (err) {
      t.equal(err.message, 'ttl must be a positive integer greater than 0')
    }
  })

  test('function ttl is a positive integer', async (t) => {
    t.plan(1)

    const cache = new Cache({ storage: createStorage() })
    try {
      cache.define('fetchSomething', { ttl: 3.14 }, async (k) => ({ k }))
    } catch (err) {
      t.equal(err.message, 'ttl must be a positive integer greater than 0')
    }
  })

  test('do not cache failures', async (t) => {
    t.plan(4)

    const cache = new Cache({ ttl: 42, storage: createStorage() })

    let called = false
    cache.define('fetchSomething', async (query) => {
      t.pass('called')
      if (!called) {
        called = true
        throw new Error('kaboom')
      }
      return { k: query }
    })

    await cache.fetchSomething(42).catch((err) => {
      t.equal(err.message, 'kaboom')
    })
    t.same(await cache.fetchSomething(42), { k: 42 })
  })

  test('function ttl has precedence over global ttl', async (t) => {
    t.plan(1)

    const cache = new Cache({ ttl: 42, storage: createStorage() })

    let callCount = 0
    cache.define('fetchSomething', { ttl: 0 }, async (query) => {
      callCount += 1
      return { k: query }
    })

    await cache.fetchSomething(42)
    await cache.fetchSomething(42)

    t.same(callCount, 2)
  })
}

module.exports[kAsyncCacheDedupeSuiteName] = 'ttl browser suite'
module.exports[kAsyncCacheDedupeSuiteHasMultipleTests] = true
