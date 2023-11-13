'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { promisify } = require('util')
const { Cache } = require('../src/cache')
const createStorage = require('../src/storage')

const sleep = promisify(setTimeout)

test('stale', async (t) => {
  const { equal, deepStrictEqual } = tspl(t, { plan: 11 })

  const storage = createStorage()

  const cache = new Cache({
    storage,
    ttl: 1,
    stale: 9
  })

  let toReturn = 42

  cache.define('fetchSomething', async (query) => {
    equal(query, 42)
    return { k: toReturn }
  })

  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })

  equal(storage.getTTL('fetchSomething~42'), 10)
  await sleep(2500)
  equal(storage.getTTL('fetchSomething~42') < 10, true)

  // This value will be revalidated
  toReturn++
  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  equal(storage.getTTL('fetchSomething~42'), 10)

  await sleep(500)

  deepStrictEqual(await cache.fetchSomething(42), { k: 43 })

  deepStrictEqual(await cache.fetchSomething(42), { k: 43 })
  equal(storage.getTTL('fetchSomething~42'), 10)
})

test('global stale is a positive integer', async (t) => {
  const { equal } = tspl(t, { plan: 1 })

  try {
    // eslint-disable-next-line no-new
    new Cache({ ttl: 42, stale: 3.14, storage: createStorage() })
  } catch (err) {
    equal(err.message, 'stale must be an integer greater or equal to 0')
  }
})

test('stale as parameter', async (t) => {
  const { equal, deepStrictEqual } = tspl(t, { plan: 6 })

  const cache = new Cache({
    storage: createStorage(),
    ttl: 1
  })

  cache.define('fetchSomething', { stale: 9 }, async (query) => {
    equal(query, 42)
    return { k: query }
  })

  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })

  await sleep(2500)

  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })

  await sleep(500)

  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
})

test('stale as a function', async (t) => {
  const { equal, deepStrictEqual } = tspl(t, { plan: 11 })

  const storage = createStorage()

  const cache = new Cache({
    storage,
    ttl: 1,
    stale: (result) => result.stale
  })

  let toReturn = 42

  cache.define('fetchSomething', async (query) => {
    equal(query, 42)
    return { k: toReturn, stale: 9 }
  })

  deepStrictEqual(await cache.fetchSomething(42), { k: 42, stale: 9 })
  deepStrictEqual(await cache.fetchSomething(42), { k: 42, stale: 9 })

  equal(storage.getTTL('fetchSomething~42'), 10)
  await sleep(2500)
  equal(storage.getTTL('fetchSomething~42') < 10, true)

  // This value will be revalidated
  toReturn++
  deepStrictEqual(await cache.fetchSomething(42), { k: 42, stale: 9 })
  equal(storage.getTTL('fetchSomething~42'), 10)

  await sleep(500)

  deepStrictEqual(await cache.fetchSomething(42), { k: 43, stale: 9 })

  deepStrictEqual(await cache.fetchSomething(42), { k: 43, stale: 9 })
  equal(storage.getTTL('fetchSomething~42'), 10)
})

test('stale as a function parameter', async (t) => {
  const { equal, deepStrictEqual } = tspl(t, { plan: 6 })

  const cache = new Cache({
    storage: createStorage(),
    ttl: 1
  })

  cache.define('fetchSomething', { stale: () => 9 }, async (query) => {
    equal(query, 42)
    return { k: query }
  })

  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })

  await sleep(2500)

  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })

  await sleep(500)

  deepStrictEqual(await cache.fetchSomething(42), { k: 42 })
})
