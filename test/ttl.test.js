'use strict'

const t = require('tap')
const { Cache } = require('..')
const { promisify } = require('util')
const { AsyncLocalStorage } = require('async_hooks')

const sleep = promisify(setTimeout)

const { test } = t

t.jobs = 3

test('ttl', async (t) => {
  t.plan(5)

  const cache = new Cache({
    ttl: 1 // seconds
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
    ttl: 2 // seconds
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

test('AsyncLocalStoreage', (t) => {
  t.plan(5)
  const als = new AsyncLocalStorage()
  const cache = new Cache({ ttl: 42000 })

  cache.define('fetchSomething', async (query) => {
    t.equal(query, 42)
    return { k: query }
  })

  als.run({ foo: 'bar' }, function () {
    setImmediate(function () {
      cache.fetchSomething(42).then((res) => {
        t.same(res, { k: 42 })
        t.same(als.getStore(), { foo: 'bar' })
      })
    })
  })

  als.run({ bar: 'foo' }, function () {
    setImmediate(function () {
      cache.fetchSomething(42).then((res) => {
        t.same(res, { k: 42 })
        t.same(als.getStore(), { bar: 'foo' })
      })
    })
  })
})

test('do not cache failures', async (t) => {
  t.plan(4)

  const cache = new Cache({ ttl: 42000 })

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

  const cache = new Cache({ ttl: 42000 })

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

  const cache = new Cache({ ttl: 42000 })

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

  const cache = new Cache({ ttl: 42000 })

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
