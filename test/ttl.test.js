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
