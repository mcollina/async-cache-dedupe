'use strict'

const { Cache } = require('../..')
const createStorage = require('../../src/storage')
const { kAsyncCacheDedupeSuiteName, kAsyncCacheDedupeSuiteHasMultipleTests } = require('./helpers/symbols.js')

module.exports = async function (test) {
  test('clear the full cache', async (t) => {
    t.plan(7)

    const cache = new Cache({ ttl: 42, storage: createStorage() })

    cache.define('fetchA', async (query) => {
      t.pass('a called')
      return { k: query }
    })

    cache.define('fetchB', async (query) => {
      t.pass('b called')
      return { j: query }
    })

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    cache.clear()

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])
  })

  test('clears only one method', async (t) => {
    t.plan(6)

    const cache = new Cache({ ttl: 42, storage: createStorage() })

    cache.define('fetchA', async (query) => {
      t.pass('a called')
      return { k: query }
    })

    cache.define('fetchB', async (query) => {
      t.pass('b called')
      return { j: query }
    })

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])

    cache.clear('fetchA')

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchB(24)
    ]), [
      { k: 42 },
      { j: 24 }
    ])
  })

  test('clears only one method with one value', async (t) => {
    t.plan(5)

    const cache = new Cache({ ttl: 42, storage: createStorage() })

    cache.define('fetchA', async (query) => {
      t.pass('a called')
      return { k: query }
    })

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchA(24)
    ]), [
      { k: 42 },
      { k: 24 }
    ])

    cache.clear('fetchA', 42)

    t.same(await Promise.all([
      cache.fetchA(42),
      cache.fetchA(24)
    ]), [
      { k: 42 },
      { k: 24 }
    ])
  })
}

module.exports[kAsyncCacheDedupeSuiteName] = 'clear browser suite'
module.exports[kAsyncCacheDedupeSuiteHasMultipleTests] = true
