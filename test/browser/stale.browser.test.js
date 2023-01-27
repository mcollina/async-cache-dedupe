'use strict'

const { Cache } = require('../..')
const createStorage = require('../../src/storage')
const { kAsyncCacheDedupeSuiteName, kAsyncCacheDedupeSuiteHasMultipleTests } = require('./helpers/symbols.js')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = async function (test) {
  test('stale', async (t) => {
    t.plan(11)

    const storage = createStorage()

    const cache = new Cache({
      storage,
      ttl: 1,
      stale: 9
    })

    let toReturn = 42

    cache.define('fetchSomething', async (query) => {
      t.equal(query, 42)
      return { k: toReturn }
    })

    t.same(await cache.fetchSomething(42), { k: 42 })
    t.same(await cache.fetchSomething(42), { k: 42 })

    t.equal(storage.getTTL('fetchSomething~42'), 10)
    await sleep(2500)
    t.equal(storage.getTTL('fetchSomething~42') < 10, true)

    // This value will be revalidated
    toReturn++
    t.same(await cache.fetchSomething(42), { k: 42 })
    t.equal(storage.getTTL('fetchSomething~42'), 10)

    await sleep(500)

    t.same(await cache.fetchSomething(42), { k: 43 })

    t.same(await cache.fetchSomething(42), { k: 43 })
    t.equal(storage.getTTL('fetchSomething~42'), 10)
  })

  test('stale as parameter', async (t) => {
    t.plan(6)

    const cache = new Cache({
      storage: createStorage(),
      ttl: 1
    })

    cache.define('fetchSomething', { stale: 9 }, async (query) => {
      t.equal(query, 42)
      return { k: query }
    })

    t.same(await cache.fetchSomething(42), { k: 42 })
    t.same(await cache.fetchSomething(42), { k: 42 })

    await sleep(2500)

    t.same(await cache.fetchSomething(42), { k: 42 })

    await sleep(500)

    t.same(await cache.fetchSomething(42), { k: 42 })
  })
}

module.exports[kAsyncCacheDedupeSuiteName] = 'stale browser suite'
module.exports[kAsyncCacheDedupeSuiteHasMultipleTests] = true
