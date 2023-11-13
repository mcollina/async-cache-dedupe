'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { Cache } = require('../src/cache')
const createStorage = require('../src/storage')

test('clear the full cache', async (t) => {
  const { ok, deepStrictEqual } = tspl(t, { plan: 7 })

  const cache = new Cache({ ttl: 42, storage: createStorage() })

  cache.define('fetchA', async (query) => {
    ok('a called')
    return { k: query }
  })

  cache.define('fetchB', async (query) => {
    ok('b called')
    return { j: query }
  })

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  cache.clear()

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])
})

test('clears only one method', async (t) => {
  const { ok, deepStrictEqual } = tspl(t, { plan: 6 })

  const cache = new Cache({ ttl: 42, storage: createStorage() })

  cache.define('fetchA', async (query) => {
    ok('a called')
    return { k: query }
  })

  cache.define('fetchB', async (query) => {
    ok('b called')
    return { j: query }
  })

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])

  cache.clear('fetchA')

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchB(24)
  ]), [
    { k: 42 },
    { j: 24 }
  ])
})

test('clears only one method with one value', async (t) => {
  const { ok, deepStrictEqual } = tspl(t, { plan: 5 })

  const cache = new Cache({ ttl: 42, storage: createStorage() })

  cache.define('fetchA', async (query) => {
    ok('a called')
    return { k: query }
  })

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchA(24)
  ]), [
    { k: 42 },
    { k: 24 }
  ])

  cache.clear('fetchA', 42)

  deepStrictEqual(await Promise.all([
    cache.fetchA(42),
    cache.fetchA(24)
  ]), [
    { k: 42 },
    { k: 24 }
  ])
})
