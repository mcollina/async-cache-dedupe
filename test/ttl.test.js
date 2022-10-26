'use strict'

const t = require('tap')
const { promisify } = require('util')
const { Cache } = require('../src/cache')
const createStorage = require('../src/storage')

const sleep = promisify(setTimeout)

const { test } = t

t.jobs = 3

test('ttl', async (t) => {
  t.plan(5)

  const cache = new Cache({
    storage: createStorage(),
    ttl: 1
  })

  cache.define('fetchSomething', async (query) => {
    t.equal(query, 42)
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })
  t.same(await cache.fetchSomething(42), { k: 42 })

  await sleep(2500)

  t.same(await cache.fetchSomething(42), { k: 42 })
})

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

test('ttl expires', async (t) => {
  t.plan(5)

  const cache = new Cache({
    storage: createStorage(),
    ttl: 2
  })

  cache.define('fetchSomething', async (query) => {
    t.equal(query, 42)
    return { k: query }
  })

  t.same(await cache.fetchSomething(42), { k: 42 })

  await sleep(1000)

  t.same(await cache.fetchSomething(42), { k: 42 })

  await sleep(3000)

  t.same(await cache.fetchSomething(42), { k: 42 })
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

  await t.rejects(cache.fetchSomething(42))
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

test('ttl as a function', async (t) => {
  t.plan(2)

  const cache = new Cache({ storage: createStorage() })

  let callCount = 0
  cache.define('fetchSomething', { ttl: ({ expiresInSeconds }) => expiresInSeconds }, async (query) => {
    callCount += 1
    return { k: query, expiresInSeconds: 2 }
  })

  await cache.fetchSomething(42)
  await cache.fetchSomething(42)
  await cache.fetchSomething(42)
  t.same(callCount, 1)

  await sleep(3000)
  await cache.fetchSomething(42)
  t.same(callCount, 2)
})
