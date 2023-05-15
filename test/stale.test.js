'use strict'

const t = require('tap')
const { promisify } = require('util')
const { Cache } = require('../src/cache')
const createStorage = require('../src/storage')

const sleep = promisify(setTimeout)

const { test } = t

t.jobs = 3

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

test('global stale is a positive integer', async (t) => {
  t.plan(1)

  try {
    // eslint-disable-next-line no-new
    new Cache({ ttl: 42, stale: 3.14, storage: createStorage() })
  } catch (err) {
    t.equal(err.message, 'stale must be an integer greater or equal to 0')
  }
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

test('stale as a function', async (t) => {
  t.plan(11)

  const storage = createStorage()

  const cache = new Cache({
    storage,
    ttl: 1,
    stale: (result) => result.stale
  })

  let toReturn = 42

  cache.define('fetchSomething', async (query) => {
    t.equal(query, 42)
    return { k: toReturn, stale: 9 }
  })

  t.same(await cache.fetchSomething(42), { k: 42, stale: 9 })
  t.same(await cache.fetchSomething(42), { k: 42, stale: 9 })

  t.equal(storage.getTTL('fetchSomething~42'), 10)
  await sleep(2500)
  t.equal(storage.getTTL('fetchSomething~42') < 10, true)

  // This value will be revalidated
  toReturn++
  t.same(await cache.fetchSomething(42), { k: 42, stale: 9 })
  t.equal(storage.getTTL('fetchSomething~42'), 10)

  await sleep(500)

  t.same(await cache.fetchSomething(42), { k: 43, stale: 9 })

  t.same(await cache.fetchSomething(42), { k: 43, stale: 9 })
  t.equal(storage.getTTL('fetchSomething~42'), 10)
})

test('stale as a function parameter', async (t) => {
  t.plan(6)

  const cache = new Cache({
    storage: createStorage(),
    ttl: 1
  })

  cache.define('fetchSomething', { stale: () => 9 }, async (query) => {
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
